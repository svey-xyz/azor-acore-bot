/**
 * Backwards-compatible shim. The canonical source of truth for behavioural
 * config now lives in `lib/config.ts` and the JSON file mounted at
 * `/config/azor.config.json`. New code should prefer `import { CONFIG } from
 * "@azor.lib/config"`.
 *
 * Env vars (TIP_ITEM_ID, GIFT_LEVEL_REQUIREMENT, GIFT_COOLDOWN,
 * ANNOUNCE_COMMANDS_GLOBALLY, ANNOUNCE_COMMANDS_TO_PLAYERS, ENABLED_COMMANDS)
 * still win when set, so existing deployments keep working unchanged.
 */
import { CONFIG } from "@azor.lib/config";

export const GIFT_ITEM_ENTRY = CONFIG.gift.itemId;
export const GIFT_LEVEL_REQUIREMENT = CONFIG.gift.minLevel;
export const GIFT_COOLDOWN = CONFIG.gift.cooldownMs;
export const ANNOUNCE_COMMANDS_GLOBALLY = CONFIG.announcements.global;
export const ANNOUNCE_COMMANDS_TO_PLAYERS = CONFIG.announcements.toPlayer;
export const ENABLED_COMMANDS = CONFIG.commands.enabled;
