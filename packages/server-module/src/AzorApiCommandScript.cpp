/*
 * mod-azor-api — CommandScript.
 *
 * Registers the `.azor api …` command tree and dispatches every endpoint.
 * Each handler writes a single JSON envelope line to the chat sink; SOAP
 * captures it from the console output channel and returns it verbatim.
 *
 * Endpoints (PLAN.md §"API surface (v1)"):
 *   Stage 2 (read):
 *     .azor api version
 *     .azor api realm population
 *     .azor api realm online [limit] [offset]
 *     .azor api character get      <name>
 *     .azor api character location <name>
 *     .azor api character status   <name>
 *   Stage 3 (interactions):
 *     .azor api character interact <name> <type> <source_type> <source_id> [json_payload]
 *     .azor api character cooldown <name> <type>
 *     .azor api character history  <name> [type] [limit]
 *   Stage 5 (account linking):
 *     .azor api link begin   <code> <source> <external_id>
 *     .azor api link confirm <code>            (in-game, SEC_PLAYER, no console)
 *     .azor api link status  <source> <external_id>
 *
 * Permission model: every command is gated to SEC_ADMINISTRATOR with
 * Console::Yes. SOAP runs as the configured SOAP account; that account's
 * security level becomes our auth boundary. Stage 7 (HTTP) will layer
 * per-source bearer tokens on top of this.
 *
 * Concurrency: handlers run on the worldserver thread (one at a time). The
 * "single CharacterDatabase transaction" PLAN.md asks for around interact is
 * achieved by sequencing: sync cooldown read → mail+audit writes appended to
 * one transaction → commit. No other writer touches our tables, so the
 * gap between the SELECT and the txn is safe.
 */

#include "AzorApi.h"
#include "AzorApiAccountLinks.h"
#include "AzorApiCharacter.h"
#include "AzorApiConfig.h"
#include "AzorApiInteractions.h"
#include "AzorApiJson.h"

#include "Chat.h"
#include "ChatCommand.h"
#include "Config.h"
#include "DatabaseEnv.h"
#include "Item.h"
#include "ItemTemplate.h"
#include "Log.h"
#include "Mail.h"
#include "ObjectAccessor.h"
#include "ObjectGuid.h"
#include "ObjectMgr.h"
#include "Player.h"
#include "ScriptMgr.h"
#include "World.h"
#include "WorldSession.h"
#include "WorldSessionMgr.h"

#include <algorithm>
#include <array>
#include <charconv>
#include <chrono>
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

    // Wall-clock epoch milliseconds. Matches the `BIGINT UNSIGNED occurred_at`
    // storage and the TS-side `Date.now()`. Don't use GameTime::GetGameTimeMS()
    // here — that's monotonic-since-startup, not epoch.
    uint64_t NowMs()
    {
        return static_cast<uint64_t>(
            std::chrono::duration_cast<std::chrono::milliseconds>(
                std::chrono::system_clock::now().time_since_epoch()).count());
    }

    // Whitelist for `source_type`. Mirrors `AZOR_API_SOURCE_TYPES` in
    // packages/shared/src/index.ts and the SQL ENUM definition. Lockstep-by-eye.
    constexpr std::array<std::string_view, 4> kSourceTypes = {
        "discord", "website", "admin", "system",
    };

    // Whitelist for `interaction_type`. Adding a type here also requires a
    // handler block inside `HandleApiCharacterInteract` (see DispatchAction)
    // and a matching entry in `AZOR_API_INTERACTION_TYPES`.
    constexpr std::array<std::string_view, 1> kInteractionTypes = {
        "gift",
    };

    // Whitelist for `link.external_source`. Narrower than `kSourceTypes`
    // because `admin`/`system` are never *linked* identities — they're
    // synthetic actors used for interaction provenance only. Mirrors
    // `AZOR_API_LINK_SOURCES` in packages/shared/src/index.ts and the SQL
    // ENUM on `mod_azor_api_account_links.external_source`.
    constexpr std::array<std::string_view, 2> kLinkSources = {
        "discord", "website",
    };

    template <std::size_t N>
    bool IsKnown(std::array<std::string_view, N> const& set, std::string_view value)
    {
        return std::find(set.begin(), set.end(), value) != set.end();
    }

    // Dispatch the side-effect for a given interaction type. Today: `gift` mails
    // a single configured item. Appends writes to `trans`; the caller commits
    // the same transaction alongside the audit-row INSERT.
    //
    // Returns `std::nullopt` on success. On failure, returns a (code, message)
    // pair the caller surfaces as an error envelope.
    std::optional<std::pair<std::string_view, std::string>>
    DispatchAction(CharacterDatabaseTransaction& trans,
                   std::string_view              interactionType,
                   uint32                        guidLow)
    {
        if (interactionType == "gift")
        {
            uint32 const itemEntry = AzorApi::Config::GetUInt32("gift.item_entry", 0);
            if (itemEntry == 0)
                return std::make_pair(AzorApi::ErrorCodes::Internal,
                                      std::string("gift.item_entry is not configured"));

            ItemTemplate const* tmpl = sObjectMgr->GetItemTemplate(itemEntry);
            if (!tmpl)
                return std::make_pair(AzorApi::ErrorCodes::Internal,
                                      "gift.item_entry " + std::to_string(itemEntry) + " is not a known item");

            Item* item = Item::CreateItem(itemEntry, 1);
            if (!item)
                return std::make_pair(AzorApi::ErrorCodes::Internal,
                                      std::string("failed to instantiate gift item"));
            item->SaveToDB(trans);

            std::string const subject = AzorApi::Config::GetString("gift.mail_subject", "A gift has arrived");
            std::string const body    = AzorApi::Config::GetString("gift.mail_body",    "A small token from across the realm.");

            MailDraft draft(subject, body);
            draft.AddItem(item);

            Player* online = ObjectAccessor::FindPlayer(ObjectGuid::Create<HighGuid::Player>(guidLow));
            MailReceiver receiver(online, static_cast<ObjectGuid::LowType>(guidLow));
            MailSender   sender(MAIL_NORMAL, /*senderGuidOrEntry=*/ 0u, MAIL_STATIONERY_GM);
            draft.SendMailTo(trans, receiver, sender);
            return std::nullopt;
        }

        // Unreachable if the caller validates `interactionType` against
        // kInteractionTypes first — defensive only.
        return std::make_pair(AzorApi::ErrorCodes::Unimplemented,
                              std::string("no handler for interaction type"));
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

    // ---- Stage 3 handlers -------------------------------------------------

    // .azor api character interact <name> <type> <source_type> <source_id> [json_payload]
    //
    // Atomic per-character action:
    //   1. Resolve character (online or in CharacterCache).
    //   2. Per-type min_level gate.
    //   3. Per-type cooldown gate (last occurrence + cooldown_ms vs. now).
    //   4. Action dispatch + audit insert inside one CharacterDatabase txn.
    //
    // Errors: not_found, invalid_arg, min_level, cooldown, internal.
    bool HandleApiCharacterInteract(ChatHandler*   handler,
                                    std::string    name,
                                    std::string    interactionType,
                                    std::string    sourceType,
                                    std::string    sourceId,
                                    Optional<Tail> payloadJson)
    {
        if (!EnsureEnabled(handler)) return true;
        LogCall(handler, "character interact");

        if (name.empty())
            return ReplyErr(handler, AzorApi::ErrorCodes::InvalidArg, "name is required");
        if (interactionType.empty())
            return ReplyErr(handler, AzorApi::ErrorCodes::InvalidArg, "interaction type is required");
        if (sourceType.empty())
            return ReplyErr(handler, AzorApi::ErrorCodes::InvalidArg, "source_type is required");
        if (sourceId.empty())
            return ReplyErr(handler, AzorApi::ErrorCodes::InvalidArg, "source_id is required");

        if (!IsKnown(kInteractionTypes, interactionType))
            return ReplyErr(handler, AzorApi::ErrorCodes::InvalidArg, "unknown interaction type");
        if (!IsKnown(kSourceTypes, sourceType))
            return ReplyErr(handler, AzorApi::ErrorCodes::InvalidArg, "unknown source_type");

        std::optional<std::string_view> payloadView;
        std::string                     payloadStorage;
        if (payloadJson)
        {
            payloadStorage = std::string(*payloadJson);
            if (!payloadStorage.empty())
            {
                // Soft cap on payload size. MySQL's JSON column type rejects
                // malformed JSON at INSERT — that path surfaces as `internal`.
                if (payloadStorage.size() > 4096)
                    return ReplyErr(handler, AzorApi::ErrorCodes::InvalidArg, "payload exceeds 4096 bytes");
                payloadView = std::string_view(payloadStorage);
            }
        }

        auto snap = AzorApi::LoadCharacter(name);
        if (!snap)
            return ReplyErr(handler, AzorApi::ErrorCodes::NotFound, "no character with that name");

        // Min-level gate (per-type). Absent or 0 means "no minimum".
        uint32 const minLevel = AzorApi::Config::GetUInt32(interactionType + ".min_level", 0u);
        if (minLevel > 0 && snap->level < minLevel)
            return ReplyErr(handler, AzorApi::ErrorCodes::MinLevel,
                            "requires level >= " + std::to_string(minLevel));

        // Cooldown gate (per-type). Absent or 0 means "no cooldown".
        uint64_t const cooldownMs = static_cast<uint64_t>(
            AzorApi::Config::GetInt64(interactionType + ".cooldown_ms", 0));
        uint64_t const nowMs  = NowMs();
        uint64_t const lastAt = AzorApi::Interactions::LastOccurredAt(snap->guid, interactionType);

        if (cooldownMs > 0 && lastAt > 0 && nowMs >= lastAt)
        {
            uint64_t const elapsed = nowMs - lastAt;
            if (elapsed < cooldownMs)
            {
                uint64_t const remaining = cooldownMs - elapsed;
                return ReplyErr(handler, AzorApi::ErrorCodes::Cooldown,
                                std::to_string(remaining) + " ms remaining");
            }
        }

        CharacterDatabaseTransaction trans = CharacterDatabase.BeginTransaction();

        if (auto err = DispatchAction(trans, interactionType, snap->guid))
            return ReplyErr(handler, err->first, err->second);

        AzorApi::Interactions::AppendInsert(trans, snap->guid, interactionType,
                                            sourceType, sourceId, payloadView, nowMs);

        CharacterDatabase.CommitTransaction(trans);

        return ReplyOk(handler, AzorApi::Json::Ok([&](Writer& w) {
            w.StartObject();
            w.Key("guid");            w.Uint(snap->guid);
            w.Key("name");            w.String(snap->name);
            w.Key("interactionType"); w.String(interactionType);
            w.Key("sourceType");      w.String(sourceType);
            w.Key("sourceId");        w.String(sourceId);
            w.Key("occurredAt");      w.Uint(nowMs);
            w.Key("cooldownMs");      w.Uint(cooldownMs);
            w.EndObject();
        }));
    }

    // .azor api character cooldown <name> <type>
    //
    // Returns the remaining cooldown for a (character, interactionType) pair.
    // `remainingMs` is 0 when no cooldown is active (no prior interaction or
    // cooldown has fully elapsed).
    bool HandleApiCharacterCooldown(ChatHandler* handler,
                                    std::string  name,
                                    std::string  interactionType)
    {
        if (!EnsureEnabled(handler)) return true;
        LogCall(handler, "character cooldown");

        if (name.empty())
            return ReplyErr(handler, AzorApi::ErrorCodes::InvalidArg, "name is required");
        if (interactionType.empty())
            return ReplyErr(handler, AzorApi::ErrorCodes::InvalidArg, "interaction type is required");
        if (!IsKnown(kInteractionTypes, interactionType))
            return ReplyErr(handler, AzorApi::ErrorCodes::InvalidArg, "unknown interaction type");

        auto snap = AzorApi::LoadCharacter(name);
        if (!snap)
            return ReplyErr(handler, AzorApi::ErrorCodes::NotFound, "no character with that name");

        uint64_t const cooldownMs = static_cast<uint64_t>(
            AzorApi::Config::GetInt64(interactionType + ".cooldown_ms", 0));
        uint64_t const nowMs  = NowMs();
        uint64_t const lastAt = AzorApi::Interactions::LastOccurredAt(snap->guid, interactionType);

        uint64_t remaining = 0;
        if (cooldownMs > 0 && lastAt > 0 && nowMs >= lastAt)
        {
            uint64_t const elapsed = nowMs - lastAt;
            if (elapsed < cooldownMs)
                remaining = cooldownMs - elapsed;
        }

        return ReplyOk(handler, AzorApi::Json::Ok([&](Writer& w) {
            w.StartObject();
            w.Key("guid");            w.Uint(snap->guid);
            w.Key("interactionType"); w.String(interactionType);
            w.Key("lastAt");          w.Uint(lastAt);
            w.Key("cooldownMs");      w.Uint(cooldownMs);
            w.Key("remainingMs");     w.Uint(remaining);
            w.EndObject();
        }));
    }

    // .azor api character history <name> [type] [limit]
    //
    // PLAN.md spec allows both trailing args to be optional, which is
    // ambiguous when only one is given (is it a type or a limit?). Resolution:
    // if arg2 is a known interaction type, treat it as the filter; if it
    // parses as uint32 and arg3 is absent, treat it as the limit. Pass `all`
    // (or omit) for an unfiltered read.
    bool HandleApiCharacterHistory(ChatHandler*          handler,
                                   std::string           name,
                                   Optional<std::string> arg2,
                                   Optional<uint32>      arg3)
    {
        if (!EnsureEnabled(handler)) return true;
        LogCall(handler, "character history");

        if (name.empty())
            return ReplyErr(handler, AzorApi::ErrorCodes::InvalidArg, "name is required");

        Optional<std::string> typeFilter;
        Optional<uint32>      limitArg;

        if (arg2)
        {
            if (*arg2 == "all" || *arg2 == "*")
            {
                if (arg3) limitArg = arg3;
            }
            else if (IsKnown(kInteractionTypes, *arg2))
            {
                typeFilter = arg2;
                if (arg3) limitArg = arg3;
            }
            else
            {
                // Try numeric — single-arg shorthand for limit-only.
                uint32 parsed = 0;
                auto [p, ec] = std::from_chars(arg2->data(), arg2->data() + arg2->size(), parsed);
                if (ec == std::errc{} && p == arg2->data() + arg2->size() && !arg3)
                    limitArg = parsed;
                else
                    return ReplyErr(handler, AzorApi::ErrorCodes::InvalidArg,
                                    "unknown interaction type (use one of the known types or `all`)");
            }
        }

        uint32 const defaultLimit = AzorApi::Config::GetUInt32("interactions.history.default_limit", 20);
        uint32 const maxLimit     = AzorApi::Config::GetUInt32("interactions.history.max_limit", 200);

        uint32 effLimit = limitArg.value_or(defaultLimit);
        if (effLimit == 0)
            return ReplyErr(handler, AzorApi::ErrorCodes::InvalidArg, "limit must be >= 1");
        if (effLimit > maxLimit)
            effLimit = maxLimit;

        auto snap = AzorApi::LoadCharacter(name);
        if (!snap)
            return ReplyErr(handler, AzorApi::ErrorCodes::NotFound, "no character with that name");

        std::optional<std::string_view> filterView;
        if (typeFilter)
            filterView = std::string_view(*typeFilter);

        std::vector<AzorApi::Interactions::HistoryRow> rows =
            AzorApi::Interactions::Load(snap->guid, filterView, effLimit);

        return ReplyOk(handler, AzorApi::Json::Ok([&](Writer& w) {
            w.StartObject();
            w.Key("guid");  w.Uint(snap->guid);
            w.Key("limit"); w.Uint(effLimit);
            w.Key("interactionType");
            if (typeFilter) w.String(*typeFilter);
            else            w.Null();
            w.Key("interactions");
            w.StartArray();
            for (auto const& row : rows)
            {
                w.StartObject();
                w.Key("id");              w.Uint(row.id);
                w.Key("interactionType"); w.String(row.interactionType);
                w.Key("sourceType");      w.String(row.sourceType);
                w.Key("sourceId");        w.String(row.sourceId);
                w.Key("occurredAt");      w.Uint(row.occurredAt);
                w.Key("payloadJson");
                // Surface the stored JSON as a string (clients re-parse if
                // they care). The hand-rolled writer has no raw-passthrough
                // mode; lifting that limitation is a Stage 7-era refactor.
                if (row.payloadJson) w.String(*row.payloadJson);
                else                 w.Null();
                w.EndObject();
            }
            w.EndArray();
            w.EndObject();
        }));
    }

    // ---- Stage 5 handlers (account linking) -------------------------------

    // Strict shape check on the 8-char hex claim code. Codes are minted by
    // clients (bot today, website tomorrow) as `crypto.randomBytes(4).toString('hex')`
    // — exactly 8 lowercase hex chars. We refuse anything else rather than
    // store arbitrary client-controlled strings as PKs.
    bool IsValidLinkCode(std::string_view s)
    {
        if (s.size() != 8) return false;
        for (char c : s)
        {
            bool const lowerHex = (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f');
            if (!lowerHex) return false;
        }
        return true;
    }

    // .azor api link begin <code> <source> <external_id>
    //
    // Registers a pending claim code. Subsequent in-game `link confirm <code>`
    // by any logged-in player will bind that player's account_id to the
    // (source, external_id). Codes expire after `link.pending_ttl_ms` (config).
    //
    // Idempotency: re-calling with the same `(code, source, external_id)`
    // returns ok (the underlying INSERT IGNORE detects collision and the
    // verify-by-read confirms our payload). A different `(source, external_id)`
    // colliding on `code` returns `invalid_arg` so the client re-rolls.
    //
    // Errors: invalid_arg, already_linked, internal.
    bool HandleApiLinkBegin(ChatHandler* handler,
                            std::string  code,
                            std::string  externalSource,
                            std::string  externalId)
    {
        if (!EnsureEnabled(handler)) return true;
        LogCall(handler, "link begin");

        if (!IsValidLinkCode(code))
            return ReplyErr(handler, AzorApi::ErrorCodes::InvalidArg,
                            "code must be exactly 8 lowercase hex chars");
        if (externalSource.empty() || !IsKnown(kLinkSources, externalSource))
            return ReplyErr(handler, AzorApi::ErrorCodes::InvalidArg, "unknown external_source");
        if (externalId.empty())
            return ReplyErr(handler, AzorApi::ErrorCodes::InvalidArg, "external_id is required");
        if (externalId.size() > 64)
            return ReplyErr(handler, AzorApi::ErrorCodes::InvalidArg, "external_id exceeds 64 bytes");

        uint64_t const nowMs = NowMs();

        // Lazy reaper. Bounds the pending table size without a background
        // worker; runs at most once per `link begin` invocation.
        AzorApi::AccountLinks::ReapExpiredPending(nowMs);

        // Already linked? Refuse rebinding — v1 doesn't support unlink.
        if (auto existing = AzorApi::AccountLinks::LoadConfirmedByExternal(externalSource, externalId))
            return ReplyErr(handler, AzorApi::ErrorCodes::AlreadyLinked,
                            "external identity is already linked to account "
                            + std::to_string(existing->accountId));

        uint64_t const ttlMs    = static_cast<uint64_t>(
            AzorApi::Config::GetInt64("link.pending_ttl_ms", 600000));
        uint64_t const expiresAt = nowMs + ttlMs;

        bool const ok = AzorApi::AccountLinks::InsertPending(
            code, externalSource, externalId, nowMs, expiresAt);

        if (!ok)
            return ReplyErr(handler, AzorApi::ErrorCodes::InvalidArg,
                            "code is already in use; retry with a different code");

        return ReplyOk(handler, AzorApi::Json::Ok([&](Writer& w) {
            w.StartObject();
            w.Key("code");           w.String(code);
            w.Key("externalSource"); w.String(externalSource);
            w.Key("externalId");     w.String(externalId);
            w.Key("createdAt");      w.Uint(nowMs);
            w.Key("expiresAt");      w.Uint(expiresAt);
            w.Key("ttlMs");          w.Uint(ttlMs);
            w.EndObject();
        }));
    }

    // .azor api link confirm <code>
    //
    // Player-invoked: redeems a pending code against the calling session's
    // account_id. Marked Console::No + SEC_PLAYER — SOAP/console can't claim,
    // and a logged-out client can't either. The session->account mapping is
    // the trust root for the binding.
    //
    // Atomic: DELETE pending + INSERT confirmed in one LoginDatabase txn.
    //
    // Errors: invalid_arg, not_found, expired, already_linked, unauthorized,
    //         internal.
    bool HandleApiLinkConfirm(ChatHandler* handler, std::string code)
    {
        if (!EnsureEnabled(handler)) return true;
        LogCall(handler, "link confirm");

        WorldSession* sess = handler->GetSession();
        if (!sess)
            return ReplyErr(handler, AzorApi::ErrorCodes::Unauthorized,
                            "link confirm requires an in-game player session");

        uint32 const accountId = sess->GetAccountId();
        if (accountId == 0)
            return ReplyErr(handler, AzorApi::ErrorCodes::Unauthorized,
                            "session has no account_id");

        if (!IsValidLinkCode(code))
            return ReplyErr(handler, AzorApi::ErrorCodes::InvalidArg,
                            "code must be exactly 8 lowercase hex chars");

        auto pending = AzorApi::AccountLinks::LoadPending(code);
        if (!pending)
            return ReplyErr(handler, AzorApi::ErrorCodes::NotFound, "no such pending code");

        uint64_t const nowMs = NowMs();
        if (nowMs >= pending->expiresAt)
        {
            // Best-effort cleanup so operator-visible state matches the error
            // response. Fine if the reaper beats us — DELETE is a no-op when
            // the row is gone.
            LoginDatabaseTransaction trans = LoginDatabase.BeginTransaction();
            AzorApi::AccountLinks::AppendDeletePending(trans, code);
            LoginDatabase.CommitTransaction(trans);
            return ReplyErr(handler, AzorApi::ErrorCodes::Expired, "claim code has expired");
        }

        // The (source, external_id) may have been linked between `link begin`
        // and `link confirm` — re-check before committing.
        if (auto existing = AzorApi::AccountLinks::LoadConfirmedByExternal(
                pending->externalSource, pending->externalId))
        {
            return ReplyErr(handler, AzorApi::ErrorCodes::AlreadyLinked,
                            "external identity is already linked to account "
                            + std::to_string(existing->accountId));
        }

        LoginDatabaseTransaction trans = LoginDatabase.BeginTransaction();
        AzorApi::AccountLinks::AppendDeletePending(trans, code);
        AzorApi::AccountLinks::AppendInsertConfirmed(
            trans, accountId, pending->externalSource, pending->externalId, nowMs);
        LoginDatabase.CommitTransaction(trans);

        return ReplyOk(handler, AzorApi::Json::Ok([&](Writer& w) {
            w.StartObject();
            w.Key("accountId");      w.Uint(accountId);
            w.Key("externalSource"); w.String(pending->externalSource);
            w.Key("externalId");     w.String(pending->externalId);
            w.Key("linkedAt");       w.Uint(nowMs);
            w.EndObject();
        }));
    }

    // .azor api link status <source> <external_id>
    //
    // Reverse lookup: given an external identity, return the bound account_id
    // (or null) and when it was linked. PK lookup on (external_source, external_id).
    //
    // Errors: invalid_arg.
    bool HandleApiLinkStatus(ChatHandler* handler,
                             std::string  externalSource,
                             std::string  externalId)
    {
        if (!EnsureEnabled(handler)) return true;
        LogCall(handler, "link status");

        if (externalSource.empty() || !IsKnown(kLinkSources, externalSource))
            return ReplyErr(handler, AzorApi::ErrorCodes::InvalidArg, "unknown external_source");
        if (externalId.empty())
            return ReplyErr(handler, AzorApi::ErrorCodes::InvalidArg, "external_id is required");

        auto link = AzorApi::AccountLinks::LoadConfirmedByExternal(externalSource, externalId);

        return ReplyOk(handler, AzorApi::Json::Ok([&](Writer& w) {
            w.StartObject();
            w.Key("externalSource"); w.String(externalSource);
            w.Key("externalId");     w.String(externalId);
            w.Key("linked");         w.Bool(link.has_value());
            w.Key("accountId");
            if (link) w.Uint(link->accountId);
            else      w.Null();
            w.Key("linkedAt");
            if (link) w.Uint(link->linkedAt);
            else      w.Null();
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
                { "interact", HandleApiCharacterInteract, SEC_ADMINISTRATOR, Console::Yes },
                { "cooldown", HandleApiCharacterCooldown, SEC_ADMINISTRATOR, Console::Yes },
                { "history",  HandleApiCharacterHistory,  SEC_ADMINISTRATOR, Console::Yes },
            };

            // `link confirm` is the one outlier: it's the only handler in the
            // module that must NOT be reachable from SOAP/console (Console::No)
            // and must be available to ordinary players (SEC_PLAYER). It reads
            // `handler->GetSession()->GetAccountId()` to know who's claiming,
            // which is meaningless from a console invocation.
            static ChatCommandTable linkTable =
            {
                { "begin",   HandleApiLinkBegin,   SEC_ADMINISTRATOR, Console::Yes },
                { "confirm", HandleApiLinkConfirm, SEC_PLAYER,        Console::No  },
                { "status",  HandleApiLinkStatus,  SEC_ADMINISTRATOR, Console::Yes },
            };

            static ChatCommandTable apiTable =
            {
                { "version",   HandleApiVersion, SEC_ADMINISTRATOR, Console::Yes },
                { "realm",     realmTable     },
                { "character", characterTable },
                { "link",      linkTable      },
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
