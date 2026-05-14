/**
 * `azor_bot` — the bot's own MySQL database.
 *
 * After Stage 4 (bot read-path migration off `acore_*`) this is the ONLY
 * MySQL surface in the bot. Bot-owned state lives here — pending claim
 * codes (Stage 5) and sender-side gift credits/cooldowns (Stage 6). The AC
 * module never reads or writes these tables.
 *
 * Schema is applied idempotently on first connect (`CREATE TABLE IF NOT EXISTS`).
 * No external migration runner; the bot owns its own DDL. The canonical text
 * lives in `BOT_DB_SCHEMA` below so an operator can grep for it.
 *
 * Connection reads `MYSQL_*` env vars directly (host/port/user/password); the
 * schema is a different *database* on the same MySQL server. The
 * `AZOR_BOT_MYSQL_DATABASE` env var overrides the default `azor_bot` name.
 * The MYSQL user must have INSERT/DELETE on this database (read-only acore_*
 * grants do NOT cover it — operators need to extend privileges before Stage 5
 * commands work).
 */

import mysql from 'mysql2/promise'
import {
	MYSQL_ENDPOINT,
	MYSQL_PASSWORD,
	MYSQL_PORT,
	MYSQL_USER,
} from '@azor.lib/conf.env'

// ---------------------------------------------------------------------------
// Schema (canonical DDL)
// ---------------------------------------------------------------------------

const BOT_DB_SCHEMA = [
	// pending_account_links — bot-side mirror of in-flight `link begin` calls.
	// Authority for whether a code is *redeemable* is the module's
	// `mod_azor_api_pending_links` table; this row exists so the bot can list
	// a user's outstanding requests and run a cheap reaper without round-
	// tripping the module.
	`CREATE TABLE IF NOT EXISTS pending_account_links (
		code            CHAR(8)         NOT NULL,
		discord_user_id VARCHAR(64)     NOT NULL,
		expires_at      BIGINT UNSIGNED NOT NULL,
		PRIMARY KEY (code),
		KEY idx_discord (discord_user_id)
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

	// discord_users — Stage 6 sender-side policy state. One row per Discord
	// user who has ever been granted credits or sent a gift. Rows are created
	// lazily: `grantGiftCredits` upserts, `recordGiftSpend` only ever touches
	// rows that already exist (a user can't spend a credit they were never
	// granted). `gift_credits` is the spend gate; `last_gift_at` stamps the
	// per-Discord-user cooldown; `cooldown_override_ms` lets an operator widen
	// or shorten that window for a single user (NULL = use the config default).
	`CREATE TABLE IF NOT EXISTS discord_users (
		discord_user_id      VARCHAR(64)     NOT NULL,
		gift_credits         INT             NOT NULL DEFAULT 0,
		last_gift_at         BIGINT UNSIGNED NOT NULL DEFAULT 0,
		cooldown_override_ms INT UNSIGNED    NULL,
		PRIMARY KEY (discord_user_id)
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
] as const

const DB_NAME = process.env.AZOR_BOT_MYSQL_DATABASE ?? 'azor_bot'

// ---------------------------------------------------------------------------
// Connection pool — lazy + cached
// ---------------------------------------------------------------------------

let _pool: mysql.Pool | undefined
let _schemaReady = false

async function pool(): Promise<mysql.Pool> {
	if (!_pool) {
		_pool = mysql.createPool({
			host: MYSQL_ENDPOINT,
			port: typeof MYSQL_PORT === 'string' ? parseInt(MYSQL_PORT, 10) : MYSQL_PORT,
			user: MYSQL_USER,
			password: MYSQL_PASSWORD,
			database: DB_NAME,
			waitForConnections: true,
			connectionLimit: 4,
		})
	}
	if (!_schemaReady) {
		for (const stmt of BOT_DB_SCHEMA) {
			await _pool.execute(stmt)
		}
		_schemaReady = true
	}
	return _pool
}

// ---------------------------------------------------------------------------
// pending_account_links — DAO
// ---------------------------------------------------------------------------

export interface PendingLinkRow {
	code: string
	discordUserId: string
	expiresAt: number
}

/**
 * INSERT a pending row. Throws on PK collision so callers can retry with a
 * fresh code (8 hex chars → 4.3B keyspace; collisions are vanishingly rare
 * but possible during reuse before TTL).
 */
export async function insertPendingLink(args: {
	code: string
	discordUserId: string
	expiresAt: number
}): Promise<void> {
	const p = await pool()
	await p.execute(
		'INSERT INTO pending_account_links (code, discord_user_id, expires_at) VALUES (?, ?, ?)',
		[args.code, args.discordUserId, args.expiresAt],
	)
}

export async function deletePendingLink(code: string): Promise<void> {
	const p = await pool()
	await p.execute('DELETE FROM pending_account_links WHERE code = ?', [code])
}

/**
 * Lazy reaper. Called at the top of every `/account link` invocation; bounds
 * table growth without a background worker. The module runs its own reaper
 * on its own table — these two stay loosely in sync via TTL parity.
 */
export async function reapExpiredPendingLinks(nowMs: number): Promise<number> {
	const p = await pool()
	const [result] = await p.execute(
		'DELETE FROM pending_account_links WHERE expires_at < ?',
		[nowMs],
	)
	// mysql2 returns ResultSetHeader for DELETE; affectedRows is reliable.
	return (result as mysql.ResultSetHeader).affectedRows
}

export async function getPendingLinksForUser(discordUserId: string): Promise<PendingLinkRow[]> {
	const p = await pool()
	const [rows] = await p.execute(
		'SELECT code, discord_user_id, expires_at FROM pending_account_links WHERE discord_user_id = ? ORDER BY expires_at DESC',
		[discordUserId],
	)
	return (rows as Array<{ code: string; discord_user_id: string; expires_at: number | string }>)
		.map((r) => ({
			code: r.code,
			discordUserId: r.discord_user_id,
			// mysql2 returns BIGINT as string by default; coerce.
			expiresAt: typeof r.expires_at === 'string' ? Number(r.expires_at) : r.expires_at,
		}))
}

// ---------------------------------------------------------------------------
// discord_users — DAO (Stage 6 sender-side policy)
// ---------------------------------------------------------------------------

export interface DiscordUserRow {
	discordUserId: string
	/** Remaining gift credits. The hard spend gate — 0 means "can't gift". */
	giftCredits: number
	/** Epoch ms of this user's last successful gift; 0 if they've never gifted. */
	lastGiftAt: number
	/** Per-user cooldown window override in ms, or null to use the config default. */
	cooldownOverrideMs: number | null
}

interface DiscordUserDbRow {
	discord_user_id: string
	gift_credits: number | string
	last_gift_at: number | string
	cooldown_override_ms: number | string | null
}

/** mysql2 hands BIGINT/UNSIGNED columns back as strings — coerce defensively. */
const num = (v: number | string): number => (typeof v === 'string' ? Number(v) : v)

/** SELECT one row, or undefined if the user has no policy state yet. */
export async function getDiscordUser(
	discordUserId: string,
): Promise<DiscordUserRow | undefined> {
	const p = await pool()
	const [rows] = await p.execute(
		'SELECT discord_user_id, gift_credits, last_gift_at, cooldown_override_ms FROM discord_users WHERE discord_user_id = ?',
		[discordUserId],
	)
	const r = (rows as DiscordUserDbRow[])[0]
	if (!r) return undefined
	return {
		discordUserId: r.discord_user_id,
		giftCredits: num(r.gift_credits),
		lastGiftAt: num(r.last_gift_at),
		cooldownOverrideMs: r.cooldown_override_ms == null ? null : num(r.cooldown_override_ms),
	}
}

/**
 * Add `delta` credits to a user, creating the row if absent. `delta` may be
 * negative (operator deduction); the balance is floored at 0 so a deduction
 * can never push a user into debt. Returns the resulting balance.
 */
export async function grantGiftCredits(
	discordUserId: string,
	delta: number,
): Promise<number> {
	const p = await pool()
	await p.execute(
		`INSERT INTO discord_users (discord_user_id, gift_credits)
		 VALUES (?, GREATEST(0, ?))
		 ON DUPLICATE KEY UPDATE gift_credits = GREATEST(0, gift_credits + VALUES(gift_credits))`,
		[discordUserId, delta],
	)
	const row = await getDiscordUser(discordUserId)
	return row?.giftCredits ?? 0
}

/**
 * Atomically spend one credit and stamp `last_gift_at`. The `gift_credits > 0`
 * guard makes this the single point of truth against double-spend: even if two
 * confirmations race, only one UPDATE matches. Returns true iff a credit was
 * actually consumed (false ⇒ the user had no credits / no row — caller should
 * treat the gift as un-billed and log it).
 */
export async function recordGiftSpend(
	discordUserId: string,
	nowMs: number,
): Promise<boolean> {
	const p = await pool()
	const [result] = await p.execute(
		'UPDATE discord_users SET gift_credits = gift_credits - 1, last_gift_at = ? WHERE discord_user_id = ? AND gift_credits > 0',
		[nowMs, discordUserId],
	)
	return (result as mysql.ResultSetHeader).affectedRows === 1
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/** Close the pool — called from bot.ts during graceful shutdown. */
export async function closeBotDb(): Promise<void> {
	if (_pool) {
		await _pool.end()
		_pool = undefined
		_schemaReady = false
	}
}
