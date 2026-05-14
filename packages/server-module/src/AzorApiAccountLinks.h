/*
 * mod-azor-api — account ↔ external identity link persistence (Stage 5).
 *
 * Two tables live in `acore_auth` (LoginDatabase):
 *   `mod_azor_api_pending_links`  — single-use short-TTL claim codes.
 *   `mod_azor_api_account_links`  — confirmed (account_id ↔ external) bindings.
 *
 * This file is pure DB plumbing. The command-script layer handles JSON
 * envelopes / argument validation / session-account resolution — keeping the
 * persistence layer reusable when Stage 7 (HTTP) ships a non-SOAP entry point.
 *
 * Concurrency: all reads/writes here run on the worldserver thread (the chat-
 * command dispatcher and PlayerScript/AccountScript hooks all execute serially
 * on the world tick). There is no parallel writer to these tables, so the
 * gap between SELECTs and INSERTs in `Confirm` is safe.
 *
 * Strings (`code`, `externalId`) are user-controlled. The `.cpp` always pipes
 * them through `LoginDatabase.EscapeString` before fmt-substituting into the
 * query — same defence-in-depth pattern as `AzorApiInteractions.cpp`.
 */

#ifndef MOD_AZOR_API_AZORAPIACCOUNTLINKS_H
#define MOD_AZOR_API_AZORAPIACCOUNTLINKS_H

#include "DatabaseEnvFwd.h"
#include "Define.h"

#include <cstdint>
#include <optional>
#include <string>
#include <string_view>

namespace AzorApi::AccountLinks
{
    struct PendingRow
    {
        std::string code;
        std::string externalSource;
        std::string externalId;
        uint64_t    createdAt = 0;
        uint64_t    expiresAt = 0;
    };

    struct ConfirmedRow
    {
        uint32      accountId      = 0;
        std::string externalSource;
        std::string externalId;
        uint64_t    linkedAt       = 0;
    };

    // ----- Pending --------------------------------------------------------

    // Lazy reaper. Called at the top of `link begin`; keeps the table small
    // without needing a periodic worker. Synchronous — runs on the worldserver
    // thread but writes are O(rows-expired) and bounded by the call cadence.
    void ReapExpiredPending(uint64_t nowMs);

    // INSERT a pending claim. Returns false if `code` is already taken (PK
    // collision) — caller should re-roll. Synchronous so the bot/website gets
    // a deterministic ack from `link begin`.
    bool InsertPending(std::string_view code,
                       std::string_view externalSource,
                       std::string_view externalId,
                       uint64_t         createdAt,
                       uint64_t         expiresAt);

    // Lookup by PK. Returns std::nullopt if no such code (already redeemed,
    // never existed, or reaped).
    std::optional<PendingRow> LoadPending(std::string_view code);

    // Append the DELETE for a successfully-redeemed code to a LoginDatabase txn.
    // Pairs with `AppendInsertConfirmed` so confirm is one atomic write.
    void AppendDeletePending(LoginDatabaseTransaction trans, std::string_view code);

    // ----- Confirmed ------------------------------------------------------

    // SELECT by external identity. PK lookup on (external_source, external_id).
    // Used by `link status` and by `link begin`/`link confirm` for the
    // already-linked precondition.
    std::optional<ConfirmedRow> LoadConfirmedByExternal(std::string_view externalSource,
                                                       std::string_view externalId);

    // Append the INSERT row for a freshly-confirmed binding.
    void AppendInsertConfirmed(LoginDatabaseTransaction trans,
                               uint32                   accountId,
                               std::string_view         externalSource,
                               std::string_view         externalId,
                               uint64_t                 linkedAtMs);

    // OnAccountDelete sink. Drops every confirmed link for the account; the
    // pending table is keyed on code, not account_id, so there's nothing to
    // clean there (and pending rows expire on their own anyway).
    void AppendDeleteByAccountId(LoginDatabaseTransaction trans, uint32 accountId);
}

#endif // MOD_AZOR_API_AZORAPIACCOUNTLINKS_H
