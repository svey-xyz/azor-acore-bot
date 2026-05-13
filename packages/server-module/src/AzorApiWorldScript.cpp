/*
 * mod-azor-api — WorldScript.
 *
 * Two responsibilities:
 *   1. Hydrate the AzorApi::Config cache from DB at the right moment in the
 *      worldserver startup sequence (after DB pool is up).
 *   2. Re-hydrate it whenever the operator runs `.reload config`.
 *
 * .conf-file values are read via sConfigMgr in the handlers that need them, not
 * cached here, because sConfigMgr already has its own cache.
 */

#include "AzorApi_loader.h"
#include "AzorApiConfig.h"

#include "Config.h"
#include "Log.h"
#include "ScriptMgr.h"

namespace
{
    class AzorApiWorldScript : public WorldScript
    {
    public:
        AzorApiWorldScript() : WorldScript("AzorApiWorldScript") {}

        // OnStartup fires after DBs are up but before the world goes online.
        // Safe place for our first DB read.
        void OnStartup() override
        {
            if (!sConfigMgr->GetOption<bool>("AzorApi.Enable", true))
            {
                LOG_INFO("module", "[AzorApi] disabled via AzorApi.Enable=0; config cache will stay empty");
                return;
            }
            AzorApi::Config::Refresh();
        }

        // OnAfterConfigLoad fires on every `.reload config`. The initial-load
        // pass (`reload == false`) happens before the DB pool is wired up, so
        // we ignore it and rely on OnStartup for the bootstrap refresh.
        void OnAfterConfigLoad(bool reload) override
        {
            if (!reload) return;
            if (!sConfigMgr->GetOption<bool>("AzorApi.Enable", true)) return;
            AzorApi::Config::Refresh();
        }
    };
}

void AddAzorApiWorldScript()
{
    new AzorApiWorldScript();
}
