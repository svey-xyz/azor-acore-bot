import { CommandInteraction } from "discord.js";
import { SlashCommandBuilder } from '@discordjs/builders';
import { Command } from "@azor/command";
import { executeSoapCommand, SOAP_COMMANDS } from "@azor/lib/executeSoapCommand";
import { getCharacterByName } from "@azor.ORM/Character";
import { TIP_COOLDOWN, TIP_ITEM_ID as GIFT_ITEM_ENTRY } from "@azor.lib/options.env";
import { getItemByEntry } from "@azor/lib/ORM/Item";

let giftName = ''
const gift = getItemByEntry(GIFT_ITEM_ENTRY).then((item) => {
	giftName = item.name
})

export const tip: Command = {
	cmdData: new SlashCommandBuilder()
		.setName('gift')
		.setDescription(`Gift ${giftName} to the character.`)
		.addStringOption(option => 
			option.setName('username')
				.setDescription("Character's name.")
				.setRequired(true)),
	async execute(commandInteraction: CommandInteraction) {
		const username = commandInteraction.options.getString('username') || ''; // TODO: sanitize input

		try {
			const character = await getCharacterByName(username)
			
			// Handle successful promise resolution
			let reply = '';
			if (!character.online)
				reply = `Character ${username} is not online.`;
			else if (character.level < 10)
				reply = `Character ${username} is too low level to be tipped.`;
			else if (character.lastTip && (Date.now() - character.lastTip) < TIP_COOLDOWN * 1000)
				reply = `${username} has been tipped recently. Please wait before tipping again. Tip cooldown is ${TIP_COOLDOWN} seconds.`;

			if (!reply) {
				executeSoapCommand[SOAP_COMMANDS.TIP_CHARACTER]({ args: { player_name: username } })
					.catch((error) => {
						console.error(`Error tipping character ${username}:`, error);
						reply = `Failed to tip character ${username}.`;
					});

				character.lastTip = Date.now();
				if (reply === '') reply = `${username} has been tipped.`;
			}

			commandInteraction.reply({ content: reply })

		} catch (error) {
			// Handle promise rejection
			console.error("Promise rejected:", error);
			commandInteraction.reply({ content: `Character ${username} not found.`, ephemeral: true });

		}
	}
};