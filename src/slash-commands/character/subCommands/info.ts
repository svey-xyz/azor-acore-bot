import { ChatInputCommandInteraction } from "discord.js";
import { DB_HANDLER } from "@azor/lib/db";
import { formatter, ORM_OBJECTS } from "@azor/lib/formatter";

export const info = {
	async execute(commandInteraction: ChatInputCommandInteraction<undefined>) {
		const username = commandInteraction.options.getString("username", true);
		
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

