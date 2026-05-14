/**
 * `azor_bot` — the bot's own MySQL database.
 *
 * After Stage 4 (bot read-path migration off `acore_*`) this is the ONLY
 * MySQL surface in the bot. Bot-owned state lives here — pending claim
 * codes today, sender-side credits and cooldowns in Stage 6. The AC module
 * never reads or writes these tables.
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
