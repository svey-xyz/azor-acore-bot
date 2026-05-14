import { Client, Collection, Events, GatewayIntentBits, MessageFlags } from "discord.js";
import { DISCORD_TOKEN } from "@azor.lib/conf.env";
import { closeBotDb } from "@azor/lib/botDb";
import { Command } from "@azor/command";
import { account } from "@azor/slash-commands/account/account";
import { character } from "@azor/slash-commands/character/character";
import { realm } from "@azor/slash-commands/realm/realm";

const COMMANDS: Array<Command> = [
		character,
		realm,
		account,
	// Add other commands here as needed
	]

async function main() {
	// Stage 4 (2026-05-13): the bot no longer connects to `acore_*` MySQL, so
	// the optional SSH tunnel is gone. All AzerothCore traffic now flows
	// through SOAP (`azorApiClient`). If a deployment puts the bot's own
	// `azor_bot` MySQL behind SSH, reach for an external tunnel.

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
		// Bot DB pool close is best-effort; don't block exit.
		void closeBotDb().catch((err) => console.error('[botDb] close failed:', err));
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
