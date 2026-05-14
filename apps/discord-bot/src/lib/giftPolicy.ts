/**
 * Sender-side gift policy — Stage 6.
 *
 * The module (`mod-azor-api`) owns the *per-character* cooldown and min-level
 * checks. This module owns the *per-Discord-user* policy that runs entirely in
 * the bot, before any SOAP round-trip:
 *
 *   1. Credits — a user must hold ≥ 1 `gift_credits` to send a gift. Operators
 *      top users up with `/admin grant-credits`. Out-of-credit users are
 *      rejected here and never reach the module (PLAN Stage 6 acceptance).
 *   2. Per-user cooldown — a minimum interval between *any* two gifts by the
 *      same Discord user, independent of which character they target. The
 *      window defaults to `CONFIG.gift.cooldownMs` and can be overridden
 *      per-user via `discord_users.cooldown_override_ms` (e.g. 0 to exempt a
 *      trusted user, or a longer window to throttle one).
 *
 * `evaluateGiftPolicy` is pure-read; the actual credit spend + cooldown stamp
 * happens in `recordGiftSpend` (botDb) after the module confirms the gift.
 */

import { CONFIG } from '@azor.lib/config'
import { getDiscordUser, type DiscordUserRow } from '@azor/lib/botDb'

export interface GiftPolicyResult {
	/** True iff the user may proceed to the module call. */
	allowed: boolean
	/** Human-readable rejection reason; present iff `allowed` is false. */
	reason?: string
	/** Credits the user holds right now (pre-spend). */
	credits: number
	/** ms remaining on the per-user cooldown; 0 when not on cooldown. */
	userCooldownRemainingMs: number
	/** The effective per-user cooldown window (override or config default). */
	userCooldownMs: number
}

/** Resolve the per-user cooldown window: explicit override wins, else config. */
function effectiveCooldownMs(row: DiscordUserRow | undefined): number {
	if (row?.cooldownOverrideMs != null) return row.cooldownOverrideMs
	return CONFIG.gift.cooldownMs
}

/**
 * Evaluate the bot-side gift policy for a Discord user. Never throws on a
 * missing row — an unknown user simply has 0 credits and is rejected.
 */
export async function evaluateGiftPolicy(
	discordUserId: string,
	nowMs: number = Date.now(),
): Promise<GiftPolicyResult> {
	const row = await getDiscordUser(discordUserId)
	const credits = row?.giftCredits ?? 0
	const userCooldownMs = effectiveCooldownMs(row)
	const lastGiftAt = row?.lastGiftAt ?? 0
	const elapsed = nowMs - lastGiftAt
	const userCooldownRemainingMs =
		lastGiftAt > 0 && elapsed >= 0 && elapsed < userCooldownMs
			? userCooldownMs - elapsed
			: 0

	if (credits <= 0) {
		return {
			allowed: false,
			reason:
				"You're out of gift credits. Ask an admin to grant you more with `/admin grant-credits`.",
			credits,
			userCooldownRemainingMs,
			userCooldownMs,
		}
	}

	if (userCooldownRemainingMs > 0) {
		return {
			allowed: false,
			reason: `You've gifted too recently. You can gift again in ~${humaniseMs(
				userCooldownRemainingMs,
			)}.`,
			credits,
			userCooldownRemainingMs,
			userCooldownMs,
		}
	}

	return { allowed: true, credits, userCooldownRemainingMs: 0, userCooldownMs }
}

/**
 * Coarse human-readable duration. Deliberately inline (no `pretty-ms` import) —
 * this runs on the hot confirmation path and the granularity here is plenty
 * for "gift again in ~3h" style copy.
 */
export function humaniseMs(ms: number): string {
	if (ms <= 0) return '0s'
	const sec = Math.round(ms / 1000)
	if (sec < 60) return `${sec}s`
	const min = Math.round(sec / 60)
	if (min < 60) return `${min}m`
	const hr = Math.round(min / 60)
	if (hr < 24) return `${hr}h`
	const day = Math.round(hr / 24)
	return `${day}d`
}
