import { CommandInteraction } from "discord.js";
import { SubCommand } from "@azor/subCommand";
import { formatter, ORM_OBJECTS } from "@azor/lib/formatter";
import { getOnlineCharacters } from "@azor.ORM/Realm";
// import { Server } from "soap";

export const pop: SubCommand = {
	async execute(commandInteraction: CommandInteraction) {
		// const server = Server.getInstance();
		// const username = commandInteraction.options.getString("username") || '';
		const characters = await getOnlineCharacters();
		const reply = formatter[ORM_OBJECTS.REALM]({ args: { characters, format: 'pop'}});
		
		commandInteraction.reply({ content: reply, ephemeral: false });
	},
}

