/*
 * mod-azor-api — runtime config cache.
 *
 * Backed by the `mod_azor_api_config` table in acore_world. Refreshed at
 * worldserver startup and on every `.reload config` so operators can tweak
 * cooldowns / item entries / level requirements without a redeploy.
 *
 * Reads are lock-free after refresh (single-writer/many-reader; refresh swaps
 * the underlying map under a mutex). Callers must treat returned values as
 * fresh-as-of-last-refresh — there is no per-key cache invalidation.
 */

#ifndef MOD_AZOR_API_AZORAPICONFIG_H
#define MOD_AZOR_API_AZORAPICONFIG_H

#include "Define.h"

#include <cstdint>
#include <string>
#include <string_view>

namespace AzorApi::Config
{
    // Re-query mod_azor_api_config and atomically swap the in-memory map.
    // Safe to call from any thread; will block briefly during the swap.
    void Refresh();

    // Lookup helpers. All return the supplied default when the key is missing
    // or the stored string fails to parse as the requested type.
    std::string GetString(std::string_view key, std::string_view fallback);
    int64_t     GetInt64 (std::string_view key, int64_t fallback);
    uint32_t    GetUInt32(std::string_view key, uint32_t fallback);
    bool        GetBool  (std::string_view key, bool fallback);
}

#endif // MOD_AZOR_API_AZORAPICONFIG_H
