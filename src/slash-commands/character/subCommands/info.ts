import { CommandInteraction } from "discord.js";
import { DB_HANDLER } from "@azor/lib/db";
import { SubCommand } from "@azor/subCommand";
import { formatter, ORM_OBJECTS } from "@azor/lib/formatter";

export const info: SubCommand = {
	async execute(commandInteraction: CommandInteraction) {
		const username = commandInteraction.options.getString("username") || '';

		try {
			const character = await DB_HANDLER.getCharacter({ username })
			
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

