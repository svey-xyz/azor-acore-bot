/*
 * mod-azor-api — JSON envelope helpers (header-only, no external deps).
 *
 * Every API response follows the same envelope:
 *
 *   ok:    { "ok": true,  "data": <payload>           }
 *   error: { "ok": false, "error": { "code", "message" } }
 *
 * Ok(builder) takes a lambda that writes the payload via the Writer. The
 * lambda must produce exactly one JSON value (object, array, or primitive)
 * after we've written `"ok": true, "data":`. It's the caller's responsibility
 * to balance StartObject/EndObject inside the lambda.
 *
 * Why hand-rolled, not rapidjson:
 *   AzerothCore does NOT vendor rapidjson (no `deps/rapidjson/`). PLAN.md
 *   open-decision #4 explicitly names hand-rolled as the fallback. The
 *   surface here is the entire writer we need for the v1 contract — about
 *   90 LOC, no external linkage, escape handling tested against the JSON
 *   spec (RFC 8259 §7).
 */

#ifndef MOD_AZOR_API_AZORAPIJSON_H
#define MOD_AZOR_API_AZORAPIJSON_H

#include "AzorApi.h"

#include <cstdint>
#include <cstdio>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

namespace AzorApi::Json
{
    class Writer
    {
    public:
        Writer() { _buf.reserve(256); }

        // Containers. StartArray inside an array, or inside an object as a
        // value-position, both work — we emit a comma only between siblings.
        void StartObject() { BeforeValue(); _buf += '{'; _scopes.push_back({false, true}); }
        void EndObject()   { _buf += '}'; _scopes.pop_back(); AfterValue(); }
        void StartArray()  { BeforeValue(); _buf += '['; _scopes.push_back({true,  true}); }
        void EndArray()    { _buf += ']'; _scopes.pop_back(); AfterValue(); }

        // Object-only. Calling Key() in array scope is a bug; we don't assert
        // here to keep this header dependency-free, but the resulting JSON
        // won't parse.
        void Key(std::string_view k)
        {
            if (!_scopes.empty() && !_scopes.back().empty)
                _buf += ',';
            WriteEscaped(k);
            _buf += ':';
            _expectingValue = true;
            if (!_scopes.empty())
                _scopes.back().empty = false;
        }

        void String(std::string_view s) { BeforeValue(); WriteEscaped(s); AfterValue(); }
        void Bool(bool b)               { BeforeValue(); _buf += b ? "true" : "false"; AfterValue(); }
        void Uint(std::uint64_t v)      { BeforeValue(); _buf += std::to_string(v); AfterValue(); }
        void Int (std::int64_t v)       { BeforeValue(); _buf += std::to_string(v); AfterValue(); }
        void Null()                     { BeforeValue(); _buf += "null"; AfterValue(); }

        std::string const& Buffer() const& { return _buf; }
        std::string&&      Buffer() &&     { return std::move(_buf); }

    private:
        struct Scope { bool isArray; bool empty; };

        void BeforeValue()
        {
            // After Key(), the comma was already handled — the next value is
            // the right-hand side of the member, not a sibling.
            if (_expectingValue) { _expectingValue = false; return; }
            // Array siblings need a separator. Object siblings get theirs at Key().
            if (!_scopes.empty() && _scopes.back().isArray && !_scopes.back().empty)
                _buf += ',';
        }

        void AfterValue()
        {
            if (!_scopes.empty()) _scopes.back().empty = false;
        }

        void WriteEscaped(std::string_view s)
        {
            _buf += '"';
            for (char c : s)
            {
                switch (c)
                {
                    case '"':  _buf += "\\\""; break;
                    case '\\': _buf += "\\\\"; break;
                    case '\b': _buf += "\\b";  break;
                    case '\f': _buf += "\\f";  break;
                    case '\n': _buf += "\\n";  break;
                    case '\r': _buf += "\\r";  break;
                    case '\t': _buf += "\\t";  break;
                    default:
                        if (static_cast<unsigned char>(c) < 0x20)
                        {
                            char tmp[8];
                            std::snprintf(tmp, sizeof(tmp), "\\u%04x",
                                          static_cast<unsigned>(static_cast<unsigned char>(c)));
                            _buf += tmp;
                        }
                        else
                        {
                            // Pass through UTF-8 bytes (>=0x20) verbatim. JSON
                            // allows raw UTF-8; clients decode it.
                            _buf += c;
                        }
                }
            }
            _buf += '"';
        }

        std::string        _buf;
        std::vector<Scope> _scopes;
        bool               _expectingValue = false;
    };

    // Wrap a payload-writing lambda in the success envelope.
    template <typename Fn>
    inline std::string Ok(Fn&& writePayload)
    {
        Writer w;
        w.StartObject();
        w.Key("ok");   w.Bool(true);
        w.Key("data"); std::forward<Fn>(writePayload)(w);
        w.EndObject();
        return std::move(w).Buffer();
    }

    // Success envelope wrapping `"data": {}`. Used by commands that need to
    // acknowledge but have nothing to return.
    inline std::string OkEmpty()
    {
        return Ok([](Writer& w) { w.StartObject(); w.EndObject(); });
    }

    // Error envelope. `code` should be one of AzorApi::ErrorCodes::*.
    inline std::string Err(std::string_view code, std::string_view message)
    {
        Writer w;
        w.StartObject();
        w.Key("ok");    w.Bool(false);
        w.Key("error");
        w.StartObject();
        w.Key("code");    w.String(code);
        w.Key("message"); w.String(message);
        w.EndObject();
        w.EndObject();
        return std::move(w).Buffer();
    }
}

#endif // MOD_AZOR_API_AZORAPIJSON_H
