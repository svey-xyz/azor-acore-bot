import { CommandInteraction } from "discord.js";
import { formatter, ORM_OBJECTS } from "@azor/lib/formatter";
import { getCharacterByName } from "@azor.ORM/Character";
import { SubCommand } from "@azor/subCommand";

export const location: SubCommand = {
	async execute(commandInteraction: CommandInteraction) {
		const username = commandInteraction.options.getString("username") || '';
		const character = await getCharacterByName(username)
		const reply = formatter[ORM_OBJECTS.CHARACTER]({args: {character, format: 'location'}});
		
		commandInteraction.reply({ content: reply, ephemeral: false });
	},
}

