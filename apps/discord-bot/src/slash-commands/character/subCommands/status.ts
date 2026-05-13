import { ChatInputCommandInteraction } from "discord.js";
import { SubCommand } from "@azor/subCommand";
import { formatter, ORM_OBJECTS } from "@azor/lib/formatter";
import { DB_HANDLER } from "@azor/lib/db";

export const status: SubCommand = {
	async execute(commandInteraction: ChatInputCommandInteraction) {
		const username = commandInteraction.options.getString("username", true);

		try {
			const character = await DB_HANDLER.getCharacter({ username })

			// Handle promise resolution
			const reply = formatter[ORM_OBJECTS.CHARACTER]({args: {character, format: 'status'}});		
			commandInteraction.reply({ content: reply, ephemeral: false });
		} catch(error) {
			// Handle promise rejection
			console.error("Promise rejected:", error);
			commandInteraction.reply({ content: `Character ${username} not found.`, ephemeral: true });

		}
	},
}