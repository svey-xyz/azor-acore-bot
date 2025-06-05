import { CommandInteraction } from "discord.js";
import { SubCommand } from "@azor/subCommand";
import { formatter, ORM_OBJECTS } from "@azor/lib/formatter";
import { getCharacterByName } from "@azor.ORM/Character";

export const status: SubCommand = {
	async execute(commandInteraction: CommandInteraction) {
		const username = commandInteraction.options.getString("username") || '';
		const character = await getCharacterByName(username)
		const reply = formatter[ORM_OBJECTS.CHARACTER]({args: {character, format: 'status'}});
				
		commandInteraction.reply({ content: reply, ephemeral: false });
	},
}