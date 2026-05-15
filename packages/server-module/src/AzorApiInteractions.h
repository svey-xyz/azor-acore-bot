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
 * Trust boundary: callers (the command-script layer today, any future
 * front-end tomorrow) MUST validate the length, charset, and shape of
 * user-controlled strings (`sourceId`, `payloadJson`) before passing them
 * here. This persistence layer treats them as already-validated and pipes
 * them through `AzorApi::Sql::Esc` (see AzorApiSql.h) as defence in depth,
 * not as the primary guard. Every interpolated query lives as a named
 * `constexpr std::string_view` at the top of the `.cpp` so the trust surface
 * is auditable in one grep.
 *
 * Prepared statements are intentionally NOT used here: AzerothCore's pool
 * sizes each connection's compiled-statement vector to the core
 * `MAX_CHARACTERDATABASE_STATEMENTS` enum, so module-added indices either
 * collide with a future core addition or silently drop off the end of the
 * vector. The `Execute`/`Query` + `Esc` path is what every shipping AC
 * module does and what the wiki recommends.
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
