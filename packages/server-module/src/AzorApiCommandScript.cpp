/*
 * mod-azor-api — CommandScript.
 *
 * Registers the `.azor api …` command tree and dispatches Stage 2 read-only
 * endpoints. Every handler writes a single JSON envelope line to the chat
 * sink; SOAP captures it from the console output channel and returns it to
 * the caller verbatim.
 *
 * Endpoints (PLAN.md §"API surface (v1)"):
 *   .azor api version
 *   .azor api realm population
 *   .azor api realm online [limit] [offset]
 *   .azor api character get      <name>
 *   .azor api character location <name>
 *   .azor api character status   <name>
 *
 * Stage 3 will graft `character interact / cooldown / history` onto the
 * `character` subtable without touching the root or `realm` branches.
 * Stage 5 grafts a `link` subtable as a sibling of `realm` / `character`.
 *
 * Permission model: every command is gated to SEC_ADMINISTRATOR with
 * Console::Yes. SOAP runs as the configured SOAP account; that account's
 * security level becomes our auth boundary. Stage 7 (HTTP) will layer
 * per-source bearer tokens on top of this.
 */

#include "AzorApi.h"
#include "AzorApiCharacter.h"
#include "AzorApiConfig.h"
#include "AzorApiJson.h"

#include "Chat.h"
#include "ChatCommand.h"
#include "Config.h"
#include "Log.h"
#include "ObjectAccessor.h"
#include "Player.h"
#include "ScriptMgr.h"
#include "World.h"
#include "WorldSession.h"
#include "WorldSessionMgr.h"

#include <algorithm>
#include <string>
#include <vector>

namespace
{
    using namespace Acore::ChatCommands;
    using Writer = AzorApi::Json::Writer;

    // ---- helpers ----------------------------------------------------------

    void Reply(ChatHandler* handler, std::string const& json)
    {
        // SendSysMessage takes the string as-is (no printf format interpretation),
        // which is what we want — JSON is allowed to contain `%`, `{`, etc.
        handler->SendSysMessage(json.c_str());
    }

    bool ReplyOk(ChatHandler* handler, std::string const& json)
    {
        Reply(handler, json);
        return true;
    }

    bool ReplyErr(ChatHandler* handler, std::string_view code, std::string_view msg)
    {
        Reply(handler, AzorApi::Json::Err(code, msg));
        // Return true so AC's ChatCommands layer treats the command as handled
        // (no auto-printed usage). Errors are encoded in our JSON envelope.
        return true;
    }

    // Collect every in-world player. Sorted by name for deterministic paging.
    // Worldserver thread; sessions map is large but always memory-resident.
    std::vector<Player*> CollectOnlinePlayers()
    {
        std::vector<Player*> out;
        WorldSessionMgr::SessionMap const& sessions = sWorldSessionMgr->GetAllSessions();
        out.reserve(sessions.size());
        for (auto const& [_, session] : sessions)
        {
            if (!session) continue;
            Player* p = session->GetPlayer();
            if (p && p->IsInWorld())
                out.push_back(p);
        }
        std::sort(out.begin(), out.end(), [](Player* a, Player* b) {
            return a->GetName() < b->GetName();
        });
        return out;
    }

    void WriteCharacterObject(Writer& w, AzorApi::CharacterSnapshot const& s)
    {
        w.StartObject();
        w.Key("guid");      w.Uint(s.guid);
        w.Key("name");      w.String(s.name);
        w.Key("race");      w.Uint(s.race);
        w.Key("class");     w.Uint(s.classId);
        w.Key("gender");    w.Uint(s.gender);
        w.Key("level");     w.Uint(s.level);
        w.Key("zoneId");    w.Uint(s.zoneId);
        w.Key("mapId");     w.Uint(s.mapId);
        w.Key("accountId"); w.Uint(s.accountId);
        w.Key("online");    w.Bool(s.online);
        w.EndObject();
    }

    void LogCall(ChatHandler const* handler, std::string_view command)
    {
        if (!sConfigMgr->GetOption<bool>("AzorApi.Log.Commands", true))
            return;
        // handler->GetSession() is null on the console path (which is what SOAP uses).
        WorldSession const* sess = handler->GetSession();
        uint32 acc = sess ? sess->GetAccountId() : 0;
        LOG_INFO("module", "[AzorApi] {} (account={})", command, acc);
    }

    bool EnsureEnabled(ChatHandler* handler)
    {
        if (sConfigMgr->GetOption<bool>("AzorApi.Enable", true))
            return true;
        ReplyErr(handler, AzorApi::ErrorCodes::Disabled, "AzorApi is disabled in worldserver.conf");
        return false;
    }

    // ---- handlers ---------------------------------------------------------

    bool HandleApiVersion(ChatHandler* handler)
    {
        if (!EnsureEnabled(handler)) return true;
        LogCall(handler, "version");

        std::string build = sConfigMgr->GetOption<std::string>("AzorApi.Build", "");
        if (build.empty()) build = "dev";

        return ReplyOk(handler, AzorApi::Json::Ok([&](Writer& w) {
            w.StartObject();
            w.Key("schema"); w.String(AzorApi::SCHEMA_VERSION);
            w.Key("build");  w.String(build);
            w.EndObject();
        }));
    }

    bool HandleApiRealmPopulation(ChatHandler* handler)
    {
        if (!EnsureEnabled(handler)) return true;
        LogCall(handler, "realm population");

        // Count by traversing sessions ourselves rather than trusting any
        // single counter — guarantees the number matches what `realm online`
        // would return on the same tick.
        uint32 total = 0;
        WorldSessionMgr::SessionMap const& sessions = sWorldSessionMgr->GetAllSessions();
        for (auto const& [_, session] : sessions)
        {
            if (!session) continue;
            Player* p = session->GetPlayer();
            if (p && p->IsInWorld())
                ++total;
        }

        return ReplyOk(handler, AzorApi::Json::Ok([&](Writer& w) {
            w.StartObject();
            w.Key("online");
            w.Uint(total);
            w.EndObject();
        }));
    }

    bool HandleApiRealmOnline(ChatHandler* handler, Optional<uint32> limit, Optional<uint32> offset)
    {
        if (!EnsureEnabled(handler)) return true;
        LogCall(handler, "realm online");

        uint32 const defaultLimit = AzorApi::Config::GetUInt32("realm.online.default_limit", 50);
        uint32 const maxLimit     = AzorApi::Config::GetUInt32("realm.online.max_limit", 500);

        uint32 effLimit  = limit.value_or(defaultLimit);
        uint32 effOffset = offset.value_or(0u);

        if (effLimit == 0)
            return ReplyErr(handler, AzorApi::ErrorCodes::InvalidArg, "limit must be >= 1");
        if (effLimit > maxLimit)
            effLimit = maxLimit;

        std::vector<Player*> players = CollectOnlinePlayers();
        uint32 const total = static_cast<uint32>(players.size());

        return ReplyOk(handler, AzorApi::Json::Ok([&](Writer& w) {
            w.StartObject();
            w.Key("total");  w.Uint(total);
            w.Key("limit");  w.Uint(effLimit);
            w.Key("offset"); w.Uint(effOffset);
            w.Key("characters");
            w.StartArray();
            if (effOffset < total)
            {
                uint32 const end = std::min<uint32>(effOffset + effLimit, total);
                for (uint32 i = effOffset; i < end; ++i)
                {
                    Player* p = players[i];
                    AzorApi::CharacterSnapshot s;
                    s.guid      = p->GetGUID().GetCounter();
                    s.name      = p->GetName();
                    s.race      = p->getRace();
                    s.classId   = p->getClass();
                    s.gender    = p->getGender();
                    s.level     = p->GetLevel();
                    s.zoneId    = p->GetZoneId();
                    s.mapId     = p->GetMapId();
                    s.accountId = p->GetSession() ? p->GetSession()->GetAccountId() : 0;
                    s.online    = true;
                    WriteCharacterObject(w, s);
                }
            }
            w.EndArray();
            w.EndObject();
        }));
    }

    bool HandleApiCharacterGet(ChatHandler* handler, Tail name)
    {
        if (!EnsureEnabled(handler)) return true;
        LogCall(handler, "character get");

        if (name.empty())
            return ReplyErr(handler, AzorApi::ErrorCodes::InvalidArg, "name is required");

        auto snap = AzorApi::LoadCharacter(name);
        if (!snap)
            return ReplyErr(handler, AzorApi::ErrorCodes::NotFound, "no character with that name");

        return ReplyOk(handler, AzorApi::Json::Ok([&](Writer& w) {
            WriteCharacterObject(w, *snap);
        }));
    }

    bool HandleApiCharacterLocation(ChatHandler* handler, Tail name)
    {
        if (!EnsureEnabled(handler)) return true;
        LogCall(handler, "character location");

        if (name.empty())
            return ReplyErr(handler, AzorApi::ErrorCodes::InvalidArg, "name is required");

        auto snap = AzorApi::LoadCharacter(name);
        if (!snap)
            return ReplyErr(handler, AzorApi::ErrorCodes::NotFound, "no character with that name");

        return ReplyOk(handler, AzorApi::Json::Ok([&](Writer& w) {
            w.StartObject();
            w.Key("zoneId"); w.Uint(snap->zoneId);
            w.Key("mapId");  w.Uint(snap->mapId);
            w.Key("online"); w.Bool(snap->online);
            w.EndObject();
        }));
    }

    bool HandleApiCharacterStatus(ChatHandler* handler, Tail name)
    {
        if (!EnsureEnabled(handler)) return true;
        LogCall(handler, "character status");

        if (name.empty())
            return ReplyErr(handler, AzorApi::ErrorCodes::InvalidArg, "name is required");

        auto snap = AzorApi::LoadCharacter(name);
        if (!snap)
            return ReplyErr(handler, AzorApi::ErrorCodes::NotFound, "no character with that name");

        return ReplyOk(handler, AzorApi::Json::Ok([&](Writer& w) {
            w.StartObject();
            w.Key("online"); w.Bool(snap->online);
            w.Key("level");  w.Uint(snap->level);
            w.EndObject();
        }));
    }

    // ---- command tree -----------------------------------------------------

    class AzorApiCommandScript : public CommandScript
    {
    public:
        AzorApiCommandScript() : CommandScript("AzorApiCommandScript") {}

        ChatCommandTable GetCommands() const override
        {
            static ChatCommandTable realmTable =
            {
                { "population", HandleApiRealmPopulation, SEC_ADMINISTRATOR, Console::Yes },
                { "online",     HandleApiRealmOnline,     SEC_ADMINISTRATOR, Console::Yes },
            };

            static ChatCommandTable characterTable =
            {
                { "get",      HandleApiCharacterGet,      SEC_ADMINISTRATOR, Console::Yes },
                { "location", HandleApiCharacterLocation, SEC_ADMINISTRATOR, Console::Yes },
                { "status",   HandleApiCharacterStatus,   SEC_ADMINISTRATOR, Console::Yes },
            };

            static ChatCommandTable apiTable =
            {
                { "version",   HandleApiVersion, SEC_ADMINISTRATOR, Console::Yes },
                { "realm",     realmTable     },
                { "character", characterTable },
            };

            static ChatCommandTable azorTable =
            {
                { "api", apiTable },
            };

            static ChatCommandTable rootTable =
            {
                { "azor", azorTable },
            };

            return rootTable;
        }
    };
}

void AddAzorApiCommandScript()
{
    new AzorApiCommandScript();
}
