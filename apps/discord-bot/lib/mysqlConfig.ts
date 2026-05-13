import { MYSQL_ENDPOINT, MYSQL_USER, MYSQL_PASSWORD } from '@azor.lib/conf.env';

/**
 * Mutable MySQL connection config.
 *
 * Initialised from environment variables via conf.env. Because mysql2
 * connections are created lazily (on the first query), the SSH tunnel can
 * safely overwrite `host` and `port` here after module load but before any
 * connection is established — DATABASE.ts reads this object at connection
 * time, not at import time.
 *
 * Direct-connection mode:  host = MYSQL_ENDPOINT, port = MYSQL_PORT
 * SSH-tunnel mode:         host = 127.0.0.1,      port = SSH_TUNNEL_LOCAL_PORT
 *                          (written by sshTunnel.ts before client.login())
 */
export const MYSQL_CONFIG = {
	host: MYSQL_ENDPOINT,
	port: parseInt(process.env.MYSQL_PORT ?? '3306', 10),
	user: MYSQL_USER,
	password: MYSQL_PASSWORD,
};
