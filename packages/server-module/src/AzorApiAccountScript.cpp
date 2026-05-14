/*
 * mod-azor-api — AccountScript hooks (Stage 5).
 *
 * Mirror of `AzorApiPlayerScript` for the auth-side link table. When the core
 * is about to delete an account, every confirmed `mod_azor_api_account_links`
 * row for that account_id is dropped in a single tiny LoginDatabase txn —
 * same crash-safety story as every other write in this module, and same
 * orphan-rows-are-the-most-common-module-bug discipline from the
 * `azerothcore-module-character-persistence` skill.
 *
 * Hook is `OnBeforeAccountDelete(uint32)` — the canonical AC surface for
 * "account row is about to disappear, get your refs out". See AC's
 * `ScriptMgr.h` AccountScript class for the full list; `OnAccountDelete`
 * itself is not a public hook in AC.
 *
 * No cleanup is performed on the pending table (`mod_azor_api_pending_links`):
 * pending rows are keyed on opaque code, not account_id, and they reap
 * themselves via TTL (`link.pending_ttl_ms`) on the next `link begin`.
 */

#include "AzorApi_loader.h"
#include "AzorApiAccountLinks.h"

#include "DatabaseEnv.h"
#include "ScriptMgr.h"

namespace
{
    class AzorApiAccountScript : public AccountScript
    {
    public:
        AzorApiAccountScript() : AccountScript("AzorApiAccountScript") {}

        void OnBeforeAccountDelete(uint32 accountId) override
        {
            LoginDatabaseTransaction trans = LoginDatabase.BeginTransaction();
            AzorApi::AccountLinks::AppendDeleteByAccountId(trans, accountId);
            LoginDatabase.CommitTransaction(trans);
        }
    };
}

void AddAzorApiAccountScript()
{
    new AzorApiAccountScript();
}
