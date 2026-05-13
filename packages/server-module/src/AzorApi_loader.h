/*
 * mod-azor-api loader header.
 *
 * AC_ADD_SCRIPT_LOADER("AzorApi", ...) in CMakeLists.txt makes the worldserver
 * call AddAzorApiScripts() during script registration. That function lives in
 * AzorApi_loader.cpp and just news up the module's Script subclasses.
 */

#ifndef MOD_AZOR_API_LOADER_H
#define MOD_AZOR_API_LOADER_H

void AddAzorApiScripts();

#endif // MOD_AZOR_API_LOADER_H
