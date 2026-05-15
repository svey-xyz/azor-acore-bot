/*
 * mod-azor-api — interaction audit log (impl).
 *
 * All interpolated SQL lives in the anonymous namespace below as named
 * `constexpr std::string_view` constants — keeps every query auditable in one
 * grep target, and every `{}` placeholder is paired with exactly one
 * documented argument. User-controlled strings are routed through
 * `AzorApi::Sql::Esc` before substitution (see AzorApiSql.h for the
 * defence-in-depth rationale).
 */

#include "AzorApiInteractions.h"
#include "AzorApiSql.h"

#include "DatabaseEnv.h"
#include "QueryResult.h"
#include "Field.h"

namespace
{
    using AzorApi::Sql::Esc;

    // args: guidLow, escType
    constexpr std::string_view SQL_SEL_LAST_OCCURRED =
        "SELECT MAX(occurred_at) FROM mod_azor_api_interactions "
        "WHERE guid = {} AND interaction_type = '{}'";

    // args: guidLow, escType, escSource, escId, escPayload, occurredAtMs
    constexpr std::string_view SQL_INS_INTERACTION_WITH_PAYLOAD =
        "INSERT INTO mod_azor_api_interactions "
        "(guid, interaction_type, source_type, source_id, payload_json, occurred_at) "
        "VALUES ({}, '{}', '{}', '{}', '{}', {})";

    // args: guidLow, escType, escSource, escId, occurredAtMs
    constexpr std::string_view SQL_INS_INTERACTION_NULL_PAYLOAD =
        "INSERT INTO mod_azor_api_interactions "
        "(guid, interaction_type, source_type, source_id, payload_json, occurred_at) "
        "VALUES ({}, '{}', '{}', '{}', NULL, {})";

    // args: guidLow, escType, limit
    constexpr std::string_view SQL_SEL_HISTORY_BY_TYPE =
        "SELECT id, interaction_type, source_type, source_id, payload_json, occurred_at "
        "FROM mod_azor_api_interactions "
        "WHERE guid = {} AND interaction_type = '{}' "
        "ORDER BY occurred_at DESC LIMIT {}";

    // args: guidLow, limit
    constexpr std::string_view SQL_SEL_HISTORY =
        "SELECT id, interaction_type, source_type, source_id, payload_json, occurred_at "
        "FROM mod_azor_api_interactions "
        "WHERE guid = {} "
        "ORDER BY occurred_at DESC LIMIT {}";

    // args: guidLow
    constexpr std::string_view SQL_DEL_BY_GUID =
        "DELETE FROM mod_azor_api_interactions WHERE guid = {}";
}

namespace AzorApi::Interactions
{
    uint64_t LastOccurredAt(uint32 guidLow, std::string_view interactionType)
    {
        // interactionType is module-validated against a known enum before
        // reaching this layer — escaping is defence in depth.
        std::string const escType = Esc(CharacterDatabase, interactionType);

        QueryResult r = CharacterDatabase.Query(SQL_SEL_LAST_OCCURRED, guidLow, escType);
        if (!r)
            return 0;

        Field* f = r->Fetch();
        // MAX() returns NULL when the partition is empty; AC's Field::IsNull
        // catches that before we'd otherwise read garbage.
        if (f[0].IsNull())
            return 0;
        return f[0].Get<uint64>();
    }

    void AppendInsert(CharacterDatabaseTransaction trans,
                      uint32                          guidLow,
                      std::string_view                interactionType,
                      std::string_view                sourceType,
                      std::string_view                sourceId,
                      std::optional<std::string_view> payloadJson,
                      uint64_t                        occurredAtMs)
    {
        std::string const escType   = Esc(CharacterDatabase, interactionType);
        std::string const escSource = Esc(CharacterDatabase, sourceType);
        std::string const escId     = Esc(CharacterDatabase, sourceId);

        if (payloadJson && !payloadJson->empty())
        {
            std::string const escPayload = Esc(CharacterDatabase, *payloadJson);
            trans->Append(SQL_INS_INTERACTION_WITH_PAYLOAD,
                guidLow, escType, escSource, escId, escPayload, occurredAtMs);
        }
        else
        {
            trans->Append(SQL_INS_INTERACTION_NULL_PAYLOAD,
                guidLow, escType, escSource, escId, occurredAtMs);
        }
    }

    std::vector<HistoryRow> Load(uint32                          guidLow,
                                 std::optional<std::string_view> typeFilter,
                                 uint32                          limit)
    {
        std::vector<HistoryRow> out;
        if (limit == 0)
            return out;

        QueryResult r;
        if (typeFilter && !typeFilter->empty())
        {
            std::string const escType = Esc(CharacterDatabase, *typeFilter);
            r = CharacterDatabase.Query(SQL_SEL_HISTORY_BY_TYPE, guidLow, escType, limit);
        }
        else
        {
            r = CharacterDatabase.Query(SQL_SEL_HISTORY, guidLow, limit);
        }

        if (!r)
            return out;

        out.reserve(r->GetRowCount());
        do
        {
            Field* f = r->Fetch();
            HistoryRow row;
            row.id              = f[0].Get<uint64>();
            row.interactionType = f[1].Get<std::string>();
            row.sourceType      = f[2].Get<std::string>();
            row.sourceId        = f[3].Get<std::string>();
            if (!f[4].IsNull())
                row.payloadJson = f[4].Get<std::string>();
            row.occurredAt      = f[5].Get<uint64>();
            out.push_back(std::move(row));
        } while (r->NextRow());

        return out;
    }

    void AppendDeleteForGuid(CharacterDatabaseTransaction trans, uint32 guidLow)
    {
        trans->Append(SQL_DEL_BY_GUID, guidLow);
    }
}
