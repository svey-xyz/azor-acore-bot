/*
 * mod-azor-api — runtime config cache (impl).
 */

#include "AzorApiConfig.h"

#include "DatabaseEnv.h"
#include "Log.h"

#include <charconv>
#include <mutex>
#include <shared_mutex>
#include <unordered_map>

namespace
{
    // Heterogeneous lookup: transparent hash + equality so we can lookup with
    // std::string_view against a map keyed by std::string without allocating.
    struct StringHash
    {
        using is_transparent = void;
        std::size_t operator()(std::string_view sv) const noexcept { return std::hash<std::string_view>{}(sv); }
        std::size_t operator()(std::string const& s) const noexcept { return std::hash<std::string_view>{}(s); }
    };
    struct StringEq
    {
        using is_transparent = void;
        bool operator()(std::string_view a, std::string_view b) const noexcept { return a == b; }
    };

    using ConfigMap = std::unordered_map<std::string, std::string, StringHash, StringEq>;

    std::shared_mutex      g_mutex;
    ConfigMap              g_map;

    template <typename T>
    bool ParseInteger(std::string_view sv, T& out)
    {
        // Trim leading whitespace; AC's DBs occasionally store padded strings.
        while (!sv.empty() && (sv.front() == ' ' || sv.front() == '\t')) sv.remove_prefix(1);
        while (!sv.empty() && (sv.back()  == ' ' || sv.back()  == '\t')) sv.remove_suffix(1);
        auto [ptr, ec] = std::from_chars(sv.data(), sv.data() + sv.size(), out);
        return ec == std::errc{} && ptr == sv.data() + sv.size();
    }
}

namespace AzorApi::Config
{
    void Refresh()
    {
        ConfigMap next;

        QueryResult result = WorldDatabase.Query("SELECT `key`, `value` FROM mod_azor_api_config");
        if (result)
        {
            next.reserve(result->GetRowCount());
            do
            {
                Field* f = result->Fetch();
                next.emplace(f[0].Get<std::string>(), f[1].Get<std::string>());
            } while (result->NextRow());
        }

        std::size_t loaded = next.size();
        {
            std::unique_lock lock(g_mutex);
            g_map.swap(next);
        }
        LOG_INFO("module", "[AzorApi] config cache refreshed ({} keys)", loaded);
    }

    std::string GetString(std::string_view key, std::string_view fallback)
    {
        std::shared_lock lock(g_mutex);
        if (auto it = g_map.find(key); it != g_map.end())
            return it->second;
        return std::string(fallback);
    }

    int64_t GetInt64(std::string_view key, int64_t fallback)
    {
        std::shared_lock lock(g_mutex);
        auto it = g_map.find(key);
        if (it == g_map.end()) return fallback;
        int64_t out{};
        return ParseInteger(it->second, out) ? out : fallback;
    }

    uint32_t GetUInt32(std::string_view key, uint32_t fallback)
    {
        std::shared_lock lock(g_mutex);
        auto it = g_map.find(key);
        if (it == g_map.end()) return fallback;
        uint32_t out{};
        return ParseInteger(it->second, out) ? out : fallback;
    }

    bool GetBool(std::string_view key, bool fallback)
    {
        std::shared_lock lock(g_mutex);
        auto it = g_map.find(key);
        if (it == g_map.end()) return fallback;
        std::string const& v = it->second;
        if (v == "1" || v == "true"  || v == "TRUE"  || v == "yes" || v == "on")  return true;
        if (v == "0" || v == "false" || v == "FALSE" || v == "no"  || v == "off") return false;
        return fallback;
    }
}
