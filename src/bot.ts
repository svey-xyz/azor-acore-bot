import { Client, Collection, Events, GatewayIntentBits, MessageFlags } from "discord.js";
import { DISCORD_TOKEN } from "@azor.lib/conf.env";
import { Command } from "@azor/command";
import { character } from "@azor/slash-commands/character/character";
import { realm } from "@azor/slash-commands/realm/realm";

const COMMANDS: Array<Command> = [
		character,
		realm
	// Add other commands here as needed
	]
const token: string = DISCORD_TOKEN;

const client = new Client({
	intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildExpressions, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.GuildPresences],
	// partials: ["MESSAGE", "CHANNEL", "REACTION"]
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

client.login(token)

// Discord bot token and permissions
// https://discord.com/api/oauth2/authorize?client_id=1379255087171375154&permissions=581085722147905&scope=bot%20applications.commands

// perms = 581085722147905
// id = 1379255087171375154