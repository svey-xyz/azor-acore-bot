import { ChatInputCommandInteraction, CommandInteraction } from "discord.js";
import { SubCommand } from "@azor/subCommand";
import { formatter, ORM_OBJECTS } from "@azor/lib/formatter";
import { DB_HANDLER } from "@azor/lib/db";

export const online: SubCommand = {
	async execute(commandInteraction: ChatInputCommandInteraction) {
		// const server = Server.getInstance();
		// const username = commandInteraction.options.getString("username") || '';
		const realm = DB_HANDLER.getRealm();
		const characters = await realm.onlineCharacters;

		const reply = formatter[ORM_OBJECTS.REALM]({ args: { characters, format: 'online'}});
		
		commandInteraction.reply({ content: reply, ephemeral: false });
	},
}

