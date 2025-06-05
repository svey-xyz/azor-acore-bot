import { CommandInteraction } from "discord.js";
import { SlashCommandBuilder } from '@discordjs/builders';
import { Command } from "@azor/command";
import { executeSoapCommand, SOAP_COMMANDS } from "@azor/lib/executeSoapCommand";
import { getCharacterByName } from "@azor.ORM/Character";

export const tip: Command = {
	cmdData: new SlashCommandBuilder()
		.setName('tip')
		.setDescription("Tip the character.")
		.addStringOption(option => 
			option.setName('username')
				.setDescription("Character's name.")
				.setRequired(true)),
	async execute(commandInteraction: CommandInteraction) {
		const username = commandInteraction.options.getString('username') || ''; // TODO: sanitize input
		const character = await getCharacterByName(username)
		let reply = '';

		if (!character.online) reply = `Character ${username} is not online.`;
		else if (character.level < 10) reply = `Character ${username} is too low level to be tipped.`;

		if (!reply) {
			executeSoapCommand[SOAP_COMMANDS.TIP_CHARACTER]({ args: { player_name: username } })
				.catch((error) => {
					console.error(`Error tipping character ${username}:`, error);
					reply = `Failed to tip character ${username}.`;
				});

			if (reply === '') reply = `Character ${username} has been tipped.`;
		}
		
		commandInteraction.reply({ content: reply })
	}
};