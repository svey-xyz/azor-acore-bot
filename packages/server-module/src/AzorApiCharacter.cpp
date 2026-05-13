/*
 * mod-azor-api — character snapshot (impl).
 */

#include "AzorApiCharacter.h"

#include "CharacterCache.h"
#include "DatabaseEnv.h"
#include "ObjectAccessor.h"
#include "Player.h"

#include <string>

namespace AzorApi
{
    std::optional<CharacterSnapshot> LoadCharacter(std::string_view name)
    {
        if (name.empty())
            return std::nullopt;

        // Hot path: online characters resolve from memory, no DB hop.
        std::string nameStr(name);
        if (Player* p = ObjectAccessor::FindPlayerByName(nameStr, false))
        {
            CharacterSnapshot s;
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
            return s;
        }

        // CharacterCache covers everyone who has logged in at least once in the
        // current worldserver lifetime + everyone loaded at startup. It's the
        // canonical AC way to look up offline characters by name.
        CharacterCacheEntry const* entry = sCharacterCache->GetCharacterCacheByName(nameStr);
        if (!entry)
            return std::nullopt;

        CharacterSnapshot s;
        s.guid      = entry->Guid.GetCounter();
        s.name      = entry->Name;
        s.race      = entry->Race;
        s.classId   = entry->Class;
        s.gender    = entry->Sex;
        s.level     = entry->Level;
        s.accountId = entry->AccountId;
        s.online    = false;

        // CharacterCache doesn't carry zone/map; fall through to a sync read.
        // This is a one-shot O(1)-on-PK query keyed by `guid`.
        if (QueryResult r = CharacterDatabase.Query(
                "SELECT zone, map FROM characters WHERE guid = {}", s.guid))
        {
            Field* f = r->Fetch();
            s.zoneId = f[0].Get<uint16>();
            s.mapId  = f[1].Get<uint16>();
        }

        return s;
    }
}
