/*
 * mod-azor-api — account-link persistence (impl).
 */

#include "AzorApiAccountLinks.h"

#include "DatabaseEnv.h"

namespace AzorApi::AccountLinks
{
    void ReapExpiredPending(uint64_t nowMs)
    {
        // Fire-and-forget. The next read still race-checks expires_at, so even
        // if the DELETE races with a `link confirm` the confirm path sees the
        // stale row and rejects it as `expired`. Async write is safe.
        LoginDatabase.Execute(
            "DELETE FROM mod_azor_api_pending_links WHERE expires_at < {}",
            nowMs);
    }

    bool InsertPending(std::string_view code,
                       std::string_view externalSource,
                       std::string_view externalId,
                       uint64_t         createdAt,
                       uint64_t         expiresAt)
    {
        std::string const escCode   = LoginDatabase.EscapeString(std::string(code));
        std::string const escSource = LoginDatabase.EscapeString(std::string(externalSource));
        std::string const escId     = LoginDatabase.EscapeString(std::string(externalId));

        // INSERT IGNORE so PK collision (existing code) returns false instead
        // of throwing. We then SELECT to confirm our row landed.
        LoginDatabase.DirectExecute(
            "INSERT IGNORE INTO mod_azor_api_pending_links "
            "(code, external_source, external_id, created_at, expires_at) "
            "VALUES ('{}', '{}', '{}', {}, {})",
            escCode, escSource, escId, createdAt, expiresAt);

        // Verify by re-reading. If `code` was already taken by some other
        // (source, external_id), the IGNORE swallowed our write and the row
        // we observe will have different attributes — treat as a collision.
        auto existing = LoadPending(code);
        if (!existing)
            return false;
        return existing->externalSource == externalSource
            && existing->externalId     == externalId
            && existing->createdAt      == createdAt
            && existing->expiresAt      == expiresAt;
    }

    std::optional<PendingRow> LoadPending(std::string_view code)
    {
        std::string const escCode = LoginDatabase.EscapeString(std::string(code));

        QueryResult r = LoginDatabase.Query(
            "SELECT code, external_source, external_id, created_at, expires_at "
            "FROM mod_azor_api_pending_links WHERE code = '{}'",
            escCode);

        if (!r)
            return std::nullopt;

        Field* f = r->Fetch();
        PendingRow row;
        row.code           = f[0].Get<std::string>();
        row.externalSource = f[1].Get<std::string>();
        row.externalId     = f[2].Get<std::string>();
        row.createdAt      = f[3].Get<uint64>();
        row.expiresAt      = f[4].Get<uint64>();
        return row;
    }

    void AppendDeletePending(LoginDatabaseTransaction trans, std::string_view code)
    {
        std::string const escCode = LoginDatabase.EscapeString(std::string(code));
        trans->Append("DELETE FROM mod_azor_api_pending_links WHERE code = '{}'", escCode);
    }

    std::optional<ConfirmedRow> LoadConfirmedByExternal(std::string_view externalSource,
                                                       std::string_view externalId)
    {
        std::string const escSource = LoginDatabase.EscapeString(std::string(externalSource));
        std::string const escId     = LoginDatabase.EscapeString(std::string(externalId));

        QueryResult r = LoginDatabase.Query(
            "SELECT account_id, external_source, external_id, linked_at "
            "FROM mod_azor_api_account_links "
            "WHERE external_source = '{}' AND external_id = '{}'",
            escSource, escId);

        if (!r)
            return std::nullopt;

        Field* f = r->Fetch();
        ConfirmedRow row;
        row.accountId      = f[0].Get<uint32>();
        row.externalSource = f[1].Get<std::string>();
        row.externalId     = f[2].Get<std::string>();
        row.linkedAt       = f[3].Get<uint64>();
        return row;
    }

    void AppendInsertConfirmed(LoginDatabaseTransaction trans,
                               uint32                   accountId,
                               std::string_view         externalSource,
                               std::string_view         externalId,
                               uint64_t                 linkedAtMs)
    {
        std::string const escSource = LoginDatabase.EscapeString(std::string(externalSource));
        std::string const escId     = LoginDatabase.EscapeString(std::string(externalId));

        trans->Append(
            "INSERT INTO mod_azor_api_account_links "
            "(account_id, external_source, external_id, linked_at) "
            "VALUES ({}, '{}', '{}', {})",
            accountId, escSource, escId, linkedAtMs);
    }

    void AppendDeleteByAccountId(LoginDatabaseTransaction trans, uint32 accountId)
    {
        trans->Append(
            "DELETE FROM mod_azor_api_account_links WHERE account_id = {}",
            accountId);
    }
}
