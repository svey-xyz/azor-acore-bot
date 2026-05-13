/*
 * mod-azor-api loader.
 *
 * Each Script subclass `new`s itself onto the global ScriptMgr; the registration
 * happens implicitly in the base-class constructor. Loader just instantiates.
 */

#include "AzorApi_loader.h"

// Forward declarations live next to each script's translation unit. We don't
// pull in their headers here to keep the loader compilation cheap and to avoid
// transitive includes of <ScriptMgr.h> bleeding into unrelated TUs.
void AddAzorApiCommandScript();
void AddAzorApiWorldScript();
void AddAzorApiPlayerScript();

void AddAzorApiScripts()
{
    AddAzorApiWorldScript();
    AddAzorApiCommandScript();
    AddAzorApiPlayerScript();
}
