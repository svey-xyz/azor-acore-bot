import { CommandInteraction } from "discord.js";
import { formatter, ORM_OBJECTS } from "@azor/lib/formatter";
import { getCharacterByName } from "@azor.ORM/Character";
import { SubCommand } from "@azor/subCommand";

export const location: SubCommand = {
	async execute(commandInteraction: CommandInteraction) {
		const username = commandInteraction.options.getString("username") || '';

		try {
			// Attempt to get the character by username}
			const character = await getCharacterByName(username)

			// Handle successful promise resolution
			const reply = formatter[ORM_OBJECTS.CHARACTER]({args: {character, format: 'location'}});
			commandInteraction.reply({ content: reply, ephemeral: false });
		} catch(error) {
			// Handle promise rejection
			console.error("Promise rejected:", error);
			commandInteraction.reply({ content: `Character ${username} not found.`, ephemeral: true });
		}
	},
}

