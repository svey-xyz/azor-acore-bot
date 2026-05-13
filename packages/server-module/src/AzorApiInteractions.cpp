/*
 * mod-azor-api — interaction audit log (impl).
 */

#include "AzorApiInteractions.h"

#include "DatabaseEnv.h"

namespace AzorApi::Interactions
{
    uint64_t LastOccurredAt(uint32 guidLow, std::string_view interactionType)
    {
        // interactionType is module-validated against a known enum before
        // reaching this layer — escaping is defence in depth.
        std::string const escType = CharacterDatabase.EscapeString(std::string(interactionType));

        QueryResult r = CharacterDatabase.Query(
            "SELECT MAX(occurred_at) FROM mod_azor_api_interactions "
            "WHERE guid = {} AND interaction_type = '{}'",
            guidLow, escType);

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
        std::string const escType   = CharacterDatabase.EscapeString(std::string(interactionType));
        std::string const escSource = CharacterDatabase.EscapeString(std::string(sourceType));
        std::string const escId     = CharacterDatabase.EscapeString(std::string(sourceId));

        if (payloadJson && !payloadJson->empty())
        {
            std::string const escPayload = CharacterDatabase.EscapeString(std::string(*payloadJson));
            trans->Append(
                "INSERT INTO mod_azor_api_interactions "
                "(guid, interaction_type, source_type, source_id, payload_json, occurred_at) "
                "VALUES ({}, '{}', '{}', '{}', '{}', {})",
                guidLow, escType, escSource, escId, escPayload, occurredAtMs);
        }
        else
        {
            trans->Append(
                "INSERT INTO mod_azor_api_interactions "
                "(guid, interaction_type, source_type, source_id, payload_json, occurred_at) "
                "VALUES ({}, '{}', '{}', '{}', NULL, {})",
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
            std::string const escType = CharacterDatabase.EscapeString(std::string(*typeFilter));
            r = CharacterDatabase.Query(
                "SELECT id, interaction_type, source_type, source_id, payload_json, occurred_at "
                "FROM mod_azor_api_interactions "
                "WHERE guid = {} AND interaction_type = '{}' "
                "ORDER BY occurred_at DESC LIMIT {}",
                guidLow, escType, limit);
        }
        else
        {
            r = CharacterDatabase.Query(
                "SELECT id, interaction_type, source_type, source_id, payload_json, occurred_at "
                "FROM mod_azor_api_interactions "
                "WHERE guid = {} "
                "ORDER BY occurred_at DESC LIMIT {}",
                guidLow, limit);
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
        trans->Append("DELETE FROM mod_azor_api_interactions WHERE guid = {}", guidLow);
    }
}
