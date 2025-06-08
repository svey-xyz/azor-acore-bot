import { CommandInteraction, ApplicationCommandSubCommand, Interaction, CommandInteractionOptionResolver, ChatInputCommandInteraction } from "discord.js";
import { DB_HANDLER } from "@azor/lib/db";
import { SubCommand } from "@azor/subCommand";
import { formatter, ORM_OBJECTS } from "@azor/lib/formatter";

export const info = {
	async execute(commandInteraction: ChatInputCommandInteraction<undefined>) {
		console.log('commandtype: ', typeof commandInteraction);
		console.log('command: ', commandInteraction);
		
		const username = commandInteraction.options.getString("username", true);
		// return
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

