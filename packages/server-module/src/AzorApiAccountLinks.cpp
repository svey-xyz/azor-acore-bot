/*
 * mod-azor-api — account-link persistence (impl).
 *
 * All interpolated SQL lives in the anonymous namespace below as named
 * `constexpr std::string_view` constants — keeps every query auditable in one
 * grep target, and every `{}` placeholder is paired with exactly one
 * documented argument. User-controlled strings are routed through
 * `AzorApi::Sql::Esc` before substitution (see AzorApiSql.h for the
 * defence-in-depth rationale).
 */

#include "AzorApiAccountLinks.h"
#include "AzorApiSql.h"

#include "DatabaseEnv.h"
#include "QueryResult.h"
#include "Field.h"

namespace
{
    using AzorApi::Sql::Esc;

    // ---- Pending --------------------------------------------------------
    // args: nowMs
    constexpr std::string_view SQL_REAP_EXPIRED =
        "DELETE FROM mod_azor_api_pending_links WHERE expires_at < {}";

    // args: escCode, escSource, escId, createdAt, expiresAt
    constexpr std::string_view SQL_INS_PENDING =
        "INSERT IGNORE INTO mod_azor_api_pending_links "
        "(code, external_source, external_id, created_at, expires_at) "
        "VALUES ('{}', '{}', '{}', {}, {})";

    // args: escCode
    constexpr std::string_view SQL_SEL_PENDING =
        "SELECT code, external_source, external_id, created_at, expires_at "
        "FROM mod_azor_api_pending_links WHERE code = '{}'";

    // args: escCode
    constexpr std::string_view SQL_DEL_PENDING =
        "DELETE FROM mod_azor_api_pending_links WHERE code = '{}'";

    // ---- Confirmed ------------------------------------------------------
    // args: escSource, escId
    constexpr std::string_view SQL_SEL_CONFIRMED_BY_EXT =
        "SELECT account_id, external_source, external_id, linked_at "
        "FROM mod_azor_api_account_links "
        "WHERE external_source = '{}' AND external_id = '{}'";

    // args: accountId, escSource, escId, linkedAtMs
    constexpr std::string_view SQL_INS_CONFIRMED =
        "INSERT INTO mod_azor_api_account_links "
        "(account_id, external_source, external_id, linked_at) "
        "VALUES ({}, '{}', '{}', {})";

    // args: accountId
    constexpr std::string_view SQL_DEL_BY_ACCOUNT =
        "DELETE FROM mod_azor_api_account_links WHERE account_id = {}";
}

namespace AzorApi::AccountLinks
{
    void ReapExpiredPending(uint64_t nowMs)
    {
        // Fire-and-forget. The next read still race-checks expires_at, so even
        // if the DELETE races with a `link confirm` the confirm path sees the
        // stale row and rejects it as `expired`. Async write is safe.
        LoginDatabase.Execute(SQL_REAP_EXPIRED, nowMs);
    }

    bool InsertPending(std::string_view code,
                       std::string_view externalSource,
                       std::string_view externalId,
                       uint64_t         createdAt,
                       uint64_t         expiresAt)
    {
        std::string const escCode   = Esc(LoginDatabase, code);
        std::string const escSource = Esc(LoginDatabase, externalSource);
        std::string const escId     = Esc(LoginDatabase, externalId);

        // INSERT IGNORE so PK collision (existing code) returns false instead
        // of throwing. We then SELECT to confirm our row landed.
        LoginDatabase.DirectExecute(SQL_INS_PENDING,
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
        std::string const escCode = Esc(LoginDatabase, code);

        QueryResult r = LoginDatabase.Query(SQL_SEL_PENDING, escCode);
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
        std::string const escCode = Esc(LoginDatabase, code);
        trans->Append(SQL_DEL_PENDING, escCode);
    }

    std::optional<ConfirmedRow> LoadConfirmedByExternal(std::string_view externalSource,
                                                       std::string_view externalId)
    {
        std::string const escSource = Esc(LoginDatabase, externalSource);
        std::string const escId     = Esc(LoginDatabase, externalId);

        QueryResult r = LoginDatabase.Query(SQL_SEL_CONFIRMED_BY_EXT, escSource, escId);
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
        std::string const escSource = Esc(LoginDatabase, externalSource);
        std::string const escId     = Esc(LoginDatabase, externalId);

        trans->Append(SQL_INS_CONFIRMED, accountId, escSource, escId, linkedAtMs);
    }

    void AppendDeleteByAccountId(LoginDatabaseTransaction trans, uint32 accountId)
    {
        trans->Append(SQL_DEL_BY_ACCOUNT, accountId);
    }
}
