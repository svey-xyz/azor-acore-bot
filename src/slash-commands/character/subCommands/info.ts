import { CommandInteraction } from "discord.js";
import { getCharacterByName } from "@azor.ORM/Character";
import { SubCommand } from "@azor/subCommand";
import { formatter, ORM_OBJECTS } from "@azor/lib/formatter";

export const info: SubCommand = {
	async execute(commandInteraction: CommandInteraction) {
		const username = commandInteraction.options.getString("username") || '';

		try {
			const character = await getCharacterByName(username)

			// Handle promise resolution
			const reply = formatter[ORM_OBJECTS.CHARACTER]({ args: { character, format: 'info' } });
			commandInteraction.reply({ content: reply, ephemeral: false });
		} catch(error) {
			// Handle promise rejection
			console.error("Promise rejected:", error);
			commandInteraction.reply({ content: `Character ${username} not found.`, ephemeral: true });

		}
		
	},
}

