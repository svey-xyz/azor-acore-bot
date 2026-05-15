#
# mod-azor-api — AzerothCore module exposing a versioned `.azor api …` SOAP/console
# command tree for external clients (Discord bot, future website, etc.).
#
# Drop this folder (or symlink it) into `<acore>/modules/mod-azor-api`. AzerothCore's
# top-level CMake recursively walks `modules/` and picks up each module's
# CMakeLists.txt via the AC_ADD_* helpers below.
#
# JSON serialization is hand-rolled in src/AzorApiJson.h — no external lib
# (rapidjson is NOT in AC's deps tree; see PLAN.md open-decision #4 fallback).
#
# AC_ADD_SCRIPT_LOADER("AzorApi", ...) makes the worldserver call
# `AddAzorApiScripts()` during script registration; that function lives in
# src/AzorApi_loader.cpp and aggregates the per-script Add* helpers.

AC_ADD_SCRIPT("${CMAKE_CURRENT_LIST_DIR}/src/AzorApi_loader.cpp")
AC_ADD_SCRIPT("${CMAKE_CURRENT_LIST_DIR}/src/AzorApiConfig.cpp")
AC_ADD_SCRIPT("${CMAKE_CURRENT_LIST_DIR}/src/AzorApiCharacter.cpp")
AC_ADD_SCRIPT("${CMAKE_CURRENT_LIST_DIR}/src/AzorApiInteractions.cpp")
AC_ADD_SCRIPT("${CMAKE_CURRENT_LIST_DIR}/src/AzorApiAccountLinks.cpp")
AC_ADD_SCRIPT("${CMAKE_CURRENT_LIST_DIR}/src/AzorApiWorldScript.cpp")
AC_ADD_SCRIPT("${CMAKE_CURRENT_LIST_DIR}/src/AzorApiPlayerScript.cpp")
AC_ADD_SCRIPT("${CMAKE_CURRENT_LIST_DIR}/src/AzorApiAccountScript.cpp")
AC_ADD_SCRIPT("${CMAKE_CURRENT_LIST_DIR}/src/AzorApiCommandScript.cpp")

AC_ADD_SCRIPT_LOADER("AzorApi" "${CMAKE_CURRENT_LIST_DIR}/src/AzorApi_loader.h")

# No config wiring is needed here. AzerothCore's modules/CMakeLists.txt globs
# conf/*.conf.dist for every module and stages each one via CopyModuleConfig
# itself — just keep conf/mod_azor_api.conf.dist in place and it gets installed.
#
# Do NOT call CopyModuleConfig from this file: it's defined in ConfigInstall.cmake,
# which the root CMakeLists.txt only include()s *after* this module's CMakeLists
# is processed (add_subdirectory in the modules/ loop runs earlier), so the
# command isn't defined yet at this point. The legacy AC_ADD_CONFIG /
# AC_ADD_CONFIG_FILE macros are deprecated no-ops in current AC.
