import { Client } from 'ssh2';
import { createServer, Server } from 'node:net';
import { readFileSync } from 'node:fs';
import { MYSQL_CONFIG } from '@azor.lib/mysqlConfig';
import {
	SSH_HOST,
	SSH_PORT,
	SSH_USER,
	SSH_PRIVATE_KEY_PATH,
	MYSQL_REMOTE_HOST,
	SSH_TUNNEL_LOCAL_PORT,
} from '@azor.lib/ssh.env';

const RECONNECT_DELAY_MS = 5_000;
const KEEPALIVE_INTERVAL_MS = 10_000;
const KEEPALIVE_COUNT_MAX = 3;

// Remote MySQL port — captured before MYSQL_CONFIG is patched
const REMOTE_MYSQL_PORT = MYSQL_CONFIG.port;

let _ssh: Client | null = null;
let _server: Server | null = null;
let _destroyed = false;

function connectSSH(onFirstReady?: () => void): void {
	if (_destroyed) return;

	const client = new Client();
	_ssh = client;

	client.once('ready', () => {
		console.log(
			`[SSH Tunnel] Connected to ${SSH_HOST}:${SSH_PORT} — ` +
			`forwarding 127.0.0.1:${SSH_TUNNEL_LOCAL_PORT} → ` +
			`${MYSQL_REMOTE_HOST}:${REMOTE_MYSQL_PORT} on remote`
		);
		onFirstReady?.();

		// Wire close handler only after ready so a pre-ready error doesn't
		// double-reconnect alongside the 'error' handler.
		client.on('close', () => {
			if (_destroyed) return;
			_ssh = null;
			console.warn(
				`[SSH Tunnel] Connection closed — reconnecting in ${RECONNECT_DELAY_MS / 1000}s…`
			);
			setTimeout(() => connectSSH(), RECONNECT_DELAY_MS);
		});
	});

	client.on('error', (err) => {
		console.error('[SSH Tunnel] SSH error:', err.message);
		// 'close' fires after 'error', so reconnect is handled there.
	});

	client.connect({
		host: SSH_HOST,
		port: SSH_PORT,
		username: SSH_USER,
		privateKey: readFileSync(SSH_PRIVATE_KEY_PATH),
		keepaliveInterval: KEEPALIVE_INTERVAL_MS,
		keepaliveCountMax: KEEPALIVE_COUNT_MAX,
	});
}

/**
 * Create an SSH tunnel that forwards a local port to the remote MySQL.
 *
 * - Patches MYSQL_CONFIG.host / MYSQL_CONFIG.port so DATABASE picks up the
 *   tunnel endpoint automatically (connections are lazy, so this is safe).
 * - Resolves once the SSH connection is established and the local server is
 *   listening — the bot can then call client.login() safely.
 * - Returns a `close()` function for graceful shutdown (SIGTERM/SIGINT).
 * - Automatically reconnects SSH on disconnect with a 5 s delay.
 */
export async function createSSHTunnel(): Promise<() => void> {
	const missing: string[] = [];
	if (!SSH_HOST) missing.push('SSH_HOST');
	if (!SSH_USER) missing.push('SSH_USER');
	if (!SSH_PRIVATE_KEY_PATH) missing.push('SSH_PRIVATE_KEY_PATH');
	if (missing.length) {
		throw new Error(
			`[SSH Tunnel] Missing required env vars: ${missing.join(', ')}`
		);
	}

	return new Promise<() => void>((resolve, reject) => {
		const server = createServer((sock) => {
			if (!_ssh) {
				console.error(
					'[SSH Tunnel] Incoming connection but SSH is not ready — dropping'
				);
				sock.destroy();
				return;
			}

			_ssh.forwardOut(
				'127.0.0.1',
				SSH_TUNNEL_LOCAL_PORT,
				MYSQL_REMOTE_HOST,
				REMOTE_MYSQL_PORT,
				(err, stream) => {
					if (err) {
						console.error('[SSH Tunnel] forwardOut error:', err.message);
						sock.destroy();
						return;
					}
					sock.pipe(stream).pipe(sock);
					sock.on('error', () => stream.destroy());
					stream.on('error', () => sock.destroy());
					stream.on('close', () => sock.destroy());
				}
			);
		});

		_server = server;

		server.on('error', (err) => {
			reject(
				new Error(
					`[SSH Tunnel] Failed to bind 127.0.0.1:${SSH_TUNNEL_LOCAL_PORT}: ${err.message}`
				)
			);
		});

		server.listen(SSH_TUNNEL_LOCAL_PORT, '127.0.0.1', () => {
			// Patch MYSQL_CONFIG so DATABASE uses the tunnel endpoint.
			// Must happen before the first mysql2 connection is created.
			MYSQL_CONFIG.host = '127.0.0.1';
			MYSQL_CONFIG.port = SSH_TUNNEL_LOCAL_PORT;

			connectSSH(() => {
				// Resolve after SSH is ready — bot startup can continue.
				resolve(() => {
					_destroyed = true;
					_ssh?.end();
					_server?.close();
				});
			});
		});
	});
}
