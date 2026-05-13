/**
 * SSH tunnel environment variables.
 * All optional — bot falls back to a direct MySQL connection when
 * SSH_TUNNEL_ENABLED is false (the default).
 */

/** Set to "true" to enable the SSH tunnel instead of a direct MySQL connection. */
export const SSH_TUNNEL_ENABLED =
	(process.env.SSH_TUNNEL_ENABLED ?? 'false').toLowerCase() === 'true';

/** SSH server hostname or IP (the machine running AzerothCore). */
export const SSH_HOST = process.env.SSH_HOST ?? '';

/** SSH server port. Default: 22 */
export const SSH_PORT = parseInt(process.env.SSH_PORT ?? '22', 10);

/** SSH username on the remote server. */
export const SSH_USER = process.env.SSH_USER ?? '';

/**
 * Absolute path to the SSH private key file on the machine running the bot.
 * Key-based auth only — no password auth supported for tunnel connections.
 * In Docker, drop the key into the mounted /config volume; the image defaults
 * SSH_PRIVATE_KEY_PATH to /config/ssh_key.
 */
export const SSH_PRIVATE_KEY_PATH = process.env.SSH_PRIVATE_KEY_PATH ?? '';

/**
 * MySQL host as seen from the SSH server.
 * Almost always 127.0.0.1 (MySQL bound to loopback on the AzerothCore host).
 * Default: 127.0.0.1
 */
export const MYSQL_REMOTE_HOST = process.env.MYSQL_REMOTE_HOST ?? '127.0.0.1';

/**
 * Local port the SSH tunnel binds to on the bot's machine.
 * mysql2 will connect to 127.0.0.1:<SSH_TUNNEL_LOCAL_PORT>.
 * Must be free. Default: 13306
 */
export const SSH_TUNNEL_LOCAL_PORT = parseInt(
	process.env.SSH_TUNNEL_LOCAL_PORT ?? '13306',
	10
);
