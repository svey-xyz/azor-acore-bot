/*
 * mod-azor-api — shared types and constants for the AzorApi module.
 *
 * The schema version + error code strings here MUST stay in lockstep with
 * `packages/shared/src/index.ts` in this monorepo. There's no automatic drift
 * detection yet (see PLAN.md open decisions); changing either side is a
 * conscious cross-cutting edit.
 */

#ifndef MOD_AZOR_API_AZORAPI_H
#define MOD_AZOR_API_AZORAPI_H

#include <string_view>

namespace AzorApi
{
    // Bumped whenever the JSON contract changes in a backwards-incompatible way.
    // Clients check this on every connect to fail fast on protocol drift.
    inline constexpr std::string_view SCHEMA_VERSION = "v1";

    // Stable error code strings. The envelope contract is:
    //   { "ok": false, "error": { "code": "<one of these>", "message": "..." } }
    // Clients switch on `code`, never on `message`.
    namespace ErrorCodes
    {
        inline constexpr std::string_view NotFound      = "not_found";
        inline constexpr std::string_view InvalidArg    = "invalid_arg";
        inline constexpr std::string_view Internal      = "internal";
        inline constexpr std::string_view Unimplemented = "unimplemented";
        inline constexpr std::string_view Disabled      = "disabled";
    }
}

#endif // MOD_AZOR_API_AZORAPI_H
