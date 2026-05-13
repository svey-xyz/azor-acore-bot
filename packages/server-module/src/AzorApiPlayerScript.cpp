/*
 * mod-azor-api — PlayerScript hooks (Stage 3).
 *
 * Single responsibility today: drop a character's audit-log rows when the
 * character is deleted. Without this, `mod_azor_api_interactions` accumulates
 * orphan rows that eventually dominate the table (see the
 * `azerothcore-module-character-persistence` skill — orphans are the most
 * common module bug).
 *
 * AC fires `OnPlayerDelete` once the character row is being torn down. We
 * route the DELETE through `AzorApi::Interactions::AppendDeleteForGuid` so
 * the table name lives in one place (the persistence layer) and the cleanup
 * commits as a tiny transaction rather than a bare `Execute` — same crash
 * safety story as every other write in this module.
 *
 * Stage 5 will add `OnAccountDelete` here for the auth-side link table.
 */

#include "AzorApi_loader.h"
#include "AzorApiInteractions.h"

#include "DatabaseEnv.h"
#include "ObjectGuid.h"
#include "ScriptMgr.h"

namespace
{
    class AzorApiPlayerScript : public PlayerScript
    {
    public:
        AzorApiPlayerScript() : PlayerScript("AzorApiPlayerScript") {}

        void OnPlayerDelete(ObjectGuid guid, uint32 /*accountId*/) override
        {
            CharacterDatabaseTransaction trans = CharacterDatabase.BeginTransaction();
            AzorApi::Interactions::AppendDeleteForGuid(trans, guid.GetCounter());
            CharacterDatabase.CommitTransaction(trans);
        }
    };
}

void AddAzorApiPlayerScript()
{
    new AzorApiPlayerScript();
}
