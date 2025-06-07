import { REST } from '@discordjs/rest'
import { Routes } from 'discord-api-types/v9';
import { Collection } from 'discord.js';
import { Command } from '@azor/command';
import { DISCORD_CLIENT_ID, DISCORD_TOKEN } from '@azor.lib/conf.env';
import { character } from '@azor/slash-commands/character/character';
import { realm } from '@azor/slash-commands/realm/realm';



export function deployCommands(client: any): Array<JSON> {
	if (!client.commands) client.commands = new Collection();

	const COMMANDS: Array<Command> = [
		character,
		realm
	// Add other commands here as needed
	]

	let commandJSON = Array<JSON>();

	COMMANDS.forEach(command => {
		client.commands.set(command.cmdData.name, command);
		commandJSON.push(command.cmdData.toJSON());
	});

	registerCommands(client);

	return commandJSON;
};

function registerCommands(client: any) {

	const rest = new REST({ version: '9' }).setToken(DISCORD_TOKEN);

	(async () => {
		try {
			console.log('Started refreshing application (/) commands.');
			await rest.put(
				Routes.applicationCommands(DISCORD_CLIENT_ID),
				{ body: client.commands.map((command: Command) => command.cmdData.toJSON()) },
			);

			console.log('Successfully reloaded application (/) commands.');
		} catch (error) {
			console.error(error);
		}
	})();
}