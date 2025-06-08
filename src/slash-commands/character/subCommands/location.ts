import { ChatInputCommandInteraction, CommandInteraction } from "discord.js";
import { formatter, ORM_OBJECTS } from "@azor/lib/formatter";
import { SubCommand } from "@azor/subCommand";
import { DB_HANDLER } from "@azor/lib/db";

export const location: SubCommand = {
	async execute(commandInteraction: ChatInputCommandInteraction) {
		const username = commandInteraction.options.getString("username", true);

		try {
			const character = await DB_HANDLER.getCharacter({ username })
			
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

