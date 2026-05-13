import 'dotenv/config';
import { readFileSync } from 'node:fs';

/**
 * User-facing config schema. Keep keys camelCase; this object is mirrored 1:1
 * in `config/azor.config.json` and `config/azor.config.schema.json`.
 *
 * Resolution order, highest priority first:
 *   1. Process env var (back-compat — see ENV_OVERRIDES below).
 *   2. JSON config file at AZOR_CONFIG_PATH (defaults to
 *      `/config/azor.config.json` in the Docker image, `./config/azor.config.json`
 *      otherwise).
 *   3. Built-in DEFAULTS in this file.
 *
 * Secrets and per-deployment endpoints (Discord/SOAP/MySQL/SSH) stay in env;
 * everything in here is behaviour/feature config that's safe to commit and
 * version next to the deployment.
 */
export type AzorConfig = {
	gift: {
		itemId: number;
		minLevel: number;
		cooldownMs: number;
	};
	announcements: {
		global: boolean;
		toPlayer: boolean;
	};
	commands: {
		enabled: string[];
	};
};

const DEFAULTS: AzorConfig = {
	gift: {
		itemId: 11966, // Small Sack of Coins
		minLevel: 10,
		cooldownMs: 86_400_000, // 24h
	},
	announcements: {
		global: true,
		toPlayer: true,
	},
	commands: {
		enabled: [
			'character.info',
			'character.location',
			'character.status',
			'character.gift',
			'realm.online',
			'realm.pop',
		],
	},
};

const DEFAULT_CONFIG_PATH = '/config/azor.config.json';

// ---- coercion helpers ---------------------------------------------------

const intFrom = (v: unknown): number | undefined => {
	if (v === undefined || v === null || v === '') return undefined;
	const n = typeof v === 'number' ? v : parseInt(String(v), 10);
	return Number.isFinite(n) ? n : undefined;
};

const boolFrom = (v: unknown): boolean | undefined => {
	if (v === undefined || v === null || v === '') return undefined;
	if (typeof v === 'boolean') return v;
	const s = String(v).trim().toLowerCase();
	if (s === 'true' || s === '1' || s === 'yes') return true;
	if (s === 'false' || s === '0' || s === 'no') return false;
	return undefined;
};

const listFrom = (v: unknown): string[] | undefined => {
	if (v === undefined || v === null || v === '') return undefined;
	if (Array.isArray(v)) return v.map(String).map((s) => s.trim()).filter(Boolean);
	return String(v)
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
};

const pick = <T>(...sources: (T | undefined)[]): T =>
	sources.find((s) => s !== undefined) as T;

// ---- file load (silent fallback to defaults) ----------------------------

const filePath = process.env.AZOR_CONFIG_PATH || DEFAULT_CONFIG_PATH;
let fileConfig: Partial<AzorConfig> | undefined;
try {
	fileConfig = JSON.parse(readFileSync(filePath, 'utf8'));
	console.log(`[config] loaded ${filePath}`);
} catch (err: unknown) {
	const e = err as NodeJS.ErrnoException;
	if (e?.code === 'ENOENT') {
		// Missing file is fine — only warn if the user explicitly pointed at it.
		if (process.env.AZOR_CONFIG_PATH) {
			console.warn(
				`[config] AZOR_CONFIG_PATH=${filePath} but the file was not found; falling back to defaults + env overrides`
			);
		}
	} else {
		throw new Error(`[config] failed to parse ${filePath}: ${e?.message ?? e}`);
	}
}

// ---- resolved config ----------------------------------------------------

export const CONFIG: AzorConfig = {
	gift: {
		itemId: pick(
			intFrom(process.env.TIP_ITEM_ID),
			intFrom(fileConfig?.gift?.itemId),
			DEFAULTS.gift.itemId
		),
		minLevel: pick(
			intFrom(process.env.GIFT_LEVEL_REQUIREMENT),
			intFrom(fileConfig?.gift?.minLevel),
			DEFAULTS.gift.minLevel
		),
		cooldownMs: pick(
			intFrom(process.env.GIFT_COOLDOWN),
			intFrom(fileConfig?.gift?.cooldownMs),
			DEFAULTS.gift.cooldownMs
		),
	},
	announcements: {
		global: pick(
			boolFrom(process.env.ANNOUNCE_COMMANDS_GLOBALLY),
			boolFrom(fileConfig?.announcements?.global),
			DEFAULTS.announcements.global
		),
		toPlayer: pick(
			boolFrom(process.env.ANNOUNCE_COMMANDS_TO_PLAYERS),
			boolFrom(fileConfig?.announcements?.toPlayer),
			DEFAULTS.announcements.toPlayer
		),
	},
	commands: {
		enabled: pick(
			listFrom(process.env.ENABLED_COMMANDS),
			listFrom(fileConfig?.commands?.enabled),
			DEFAULTS.commands.enabled
		),
	},
};
