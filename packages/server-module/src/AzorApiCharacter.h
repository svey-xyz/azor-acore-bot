/*
 * mod-azor-api — character snapshot.
 *
 * Unified read of "what do we know about character <name>?", merging:
 *   - the live Player object (if logged in)
 *   - the global CharacterCache (always available for any character that exists)
 *   - one targeted sync SELECT against `characters` for zone/map when offline
 *
 * The snapshot is the lowest-common-denominator shape consumed by every read
 * endpoint (`character get`, `character location`, `character status`). Each
 * handler picks which fields to surface in its JSON.
 *
 * Cost: one O(1) hashmap lookup hot path online; one ~10ms sync query for
 * offline lookups. Worldserver thread blocks during the sync query — that's
 * fine for console/SOAP-invoked commands but a no-go for in-game scripted hot
 * paths. None of those exist yet for this module.
 */

#ifndef MOD_AZOR_API_AZORAPICHARACTER_H
#define MOD_AZOR_API_AZORAPICHARACTER_H

#include "Define.h"
#include "ObjectGuid.h"

#include <optional>
#include <string>
#include <string_view>

namespace AzorApi
{
    struct CharacterSnapshot
    {
        ObjectGuid::LowType guid    = 0;
        std::string         name;
        uint8               race    = 0;
        uint8               classId = 0;
        uint8               gender  = 0;
        uint8               level   = 0;
        uint32              zoneId  = 0;
        uint32              mapId   = 0;
        uint32              accountId = 0;
        bool                online  = false;
    };

    // Returns std::nullopt when no character with that name exists. Lookup is
    // case-insensitive (matches CharacterCache's behavior).
    std::optional<CharacterSnapshot> LoadCharacter(std::string_view name);
}

#endif // MOD_AZOR_API_AZORAPICHARACTER_H
