/*
 * mod-azor-api — tiny SQL helpers shared by the persistence translation units.
 *
 * Single purpose: contain the `DatabaseWorkerPool::EscapeString` footgun in
 * exactly one place. AC's EscapeString is `void EscapeString(std::string&)` —
 * it mutates in place and returns void, so you cannot chain it into an
 * initializer (`auto x = pool.EscapeString(std::string(sv));` fails to
 * compile). Every call site that needs escaping goes through `Esc()` below.
 *
 * `Esc` is intentionally a defence-in-depth measure, NOT the primary input
 * guard. Length, charset, and shape validation happens at the command-script
 * edge (see AzorApiCommandScript.cpp). By the time a string reaches the
 * `AccountLinks::` / `Interactions::` layer it has already been validated; we
 * still escape because (a) we interpolate via `Acore::StringFormatFmt`, which
 * does not auto-escape string args, and (b) any future caller (HTTP front-end,
 * direct script) inherits the same protection for free.
 */

#ifndef MOD_AZOR_API_AZORAPISQL_H
#define MOD_AZOR_API_AZORAPISQL_H

#include <string>
#include <string_view>

namespace AzorApi::Sql
{
    // Pool is templated so we can call this against `LoginDatabase` (acore_auth)
    // and `CharacterDatabase` (acore_characters) without dragging the full
    // DatabaseEnv into this header — keep this TU compile-cheap.
    template <typename Pool>
    inline std::string Esc(Pool& pool, std::string_view s)
    {
        std::string out(s);
        pool.EscapeString(out);
        return out;
    }
}

#endif // MOD_AZOR_API_AZORAPISQL_H
