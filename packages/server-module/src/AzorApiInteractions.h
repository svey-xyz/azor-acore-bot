/*
 * mod-azor-api — interaction audit log (Stage 3).
 *
 * Thin persistence layer over `mod_azor_api_interactions` in acore_characters.
 * Pure DB plumbing: cooldown lookup (`LastOccurredAt`), history reads (`Load`),
 * txn-scoped writes (`AppendInsert`, `AppendDeleteForGuid`).
 *
 * The command-script layer orchestrates these calls — this file does not know
 * about JSON envelopes, ChatHandler, or worldserver state. That separation
 * lets a Stage 7 HTTP front-end reuse the same functions.
 *
 * Concurrency note: callers run on the worldserver thread (one at a time per
 * tick). Reads and writes therefore see a quiescent table — the only other
 * writer is `OnPlayerDelete`, which also runs on the worldserver thread. There
 * is no separate worker bashing the table.
 *
 * String args (`sourceId`, `payloadJson`) are user-controlled (Discord user
 * id, free-form JSON). The `.cpp` always pipes them through
 * `CharacterDatabase.EscapeString` before fmt-substituting into the query — we
 * do NOT register prepared statements (would require patching core enums in
 * `CharacterDatabaseStatements.h`, which a module must not do).
 */

#ifndef MOD_AZOR_API_AZORAPIINTERACTIONS_H
#define MOD_AZOR_API_AZORAPIINTERACTIONS_H

#include "DatabaseEnvFwd.h"
#include "Define.h"

#include <cstdint>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

namespace AzorApi::Interactions
{
    struct HistoryRow
    {
        uint64_t                   id              = 0;
        std::string                interactionType;
        std::string                sourceType;
        std::string                sourceId;
        std::optional<std::string> payloadJson;       // nullopt when SQL NULL.
        uint64_t                   occurredAt      = 0;
    };

    // Latest `occurred_at` for the (guid, interactionType) pair. Returns 0 when
    // the player has never received this interaction. O(1) on the composite
    // index. Synchronous — fine for command-script context.
    uint64_t LastOccurredAt(uint32 guidLow, std::string_view interactionType);

    // Append the audit-row INSERT to an open transaction. Does NOT execute;
    // caller commits the transaction once every write in the batch is queued.
    // `payloadJson` writes SQL NULL when nullopt or empty.
    void AppendInsert(CharacterDatabaseTransaction trans,
                      uint32                          guidLow,
                      std::string_view                interactionType,
                      std::string_view                sourceType,
                      std::string_view                sourceId,
                      std::optional<std::string_view> payloadJson,
                      uint64_t                        occurredAtMs);

    // Paginated audit read. `limit` is clamped by the caller against the
    // module's history.* config keys (default 20, max 200). When `typeFilter`
    // is set, only rows with that exact `interaction_type` are returned. Rows
    // come back newest-first (`ORDER BY occurred_at DESC`).
    std::vector<HistoryRow> Load(uint32                          guidLow,
                                 std::optional<std::string_view> typeFilter,
                                 uint32                          limit);

    // OnPlayerDelete sink. Appends a `DELETE … WHERE guid = ?` to the supplied
    // transaction so the cleanup commits atomically with the rest of the
    // hook's work.
    void AppendDeleteForGuid(CharacterDatabaseTransaction trans, uint32 guidLow);
}

#endif // MOD_AZOR_API_AZORAPIINTERACTIONS_H
