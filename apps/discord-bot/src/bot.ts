import { Client, Collection, Events, GatewayIntentBits, MessageFlags } from "discord.js";
import { DISCORD_TOKEN } from "@azor.lib/conf.env";
import { SSH_TUNNEL_ENABLED } from "@azor.lib/ssh.env";
import { createSSHTunnel } from "@azor.lib/sshTunnel";
import { Command } from "@azor/command";
import { character } from "@azor/slash-commands/character/character";
import { realm } from "@azor/slash-commands/realm/realm";

const COMMANDS: Array<Command> = [
		character,
		realm
	// Add other commands here as needed
	]

async function main() {
	// ── SSH tunnel ──────────────────────────────────────────────────────────
	// Must be established before client.login() so MYSQL_CONFIG is patched
	// before the first MySQL connection is created (connections are lazy).
	let closeTunnel: (() => void) | undefined;

	if (SSH_TUNNEL_ENABLED) {
		console.log('[SSH Tunnel] Initialising…');
		closeTunnel = await createSSHTunnel();
	}

	// ── Discord client ──────────────────────────────────────────────────────
	const client = new Client({
		intents: [
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildExpressions,
			GatewayIntentBits.GuildMembers,
			GatewayIntentBits.GuildMessageReactions,
			GatewayIntentBits.GuildPresences
		],
	});

	client.commands = new Collection();
	COMMANDS.forEach(command => {
		client.commands.set(command.cmdData.name, command);
	});

	client.once(Events.ClientReady, readyClient => {
		console.log(`Ready! Logged in as ${readyClient.user.tag}`);
	});

	client.on(Events.InteractionCreate, async interaction => {
		if (!interaction.isChatInputCommand()) return;
		const command = interaction.client.commands.get(interaction.commandName);

		if (!command) {
			console.error(`No command matching ${interaction.commandName} was found.`);
			return;
		}

		try {
			await command.execute(interaction);
		} catch (error) {
			console.error(error);
			if (interaction.replied || interaction.deferred) {
				await interaction.followUp({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral });
			} else {
				await interaction.reply({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral });
			}
		}
	});

	// ── Graceful shutdown ───────────────────────────────────────────────────
	const shutdown = (signal: string) => {
		console.log(`\nReceived ${signal} — shutting down…`);
		closeTunnel?.();
		client.destroy();
		process.exit(0);
	};

	process.on('SIGTERM', () => shutdown('SIGTERM'));
	process.on('SIGINT',  () => shutdown('SIGINT'));

	await client.login(DISCORD_TOKEN);
}

main().catch(err => {
	console.error('Fatal error during startup:', err);
	process.exit(1);
});

// Discord bot token and permissions
// https://discord.com/api/oauth2/authorize?client_id=1379255087171375154&permissions=581085722147905&scope=bot%20applications.commands

// perms = 581085722147905
// id = 1379255087171375154
