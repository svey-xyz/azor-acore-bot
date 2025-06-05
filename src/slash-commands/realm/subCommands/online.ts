import { CommandInteraction } from "discord.js";
// import { getCharacter } from "../../../lib/ORM/Character";
// import { Character } from "src/lib/ORM/Character";
import { SubCommand } from "src/subCommand";
import { formatter, ORM_OBJECTS } from "../../../lib/formatter";
import { getOnlineCharacters } from "../../../lib/ORM/Realm";
// import { Server } from "soap";

export const online: SubCommand = {
	async execute(commandInteraction: CommandInteraction) {
		// const server = Server.getInstance();
		// const username = commandInteraction.options.getString("username") || '';
		const characters = await getOnlineCharacters();
		const reply = formatter[ORM_OBJECTS.REALM]({ args: { characters, format: 'online'}});
		
		commandInteraction.reply({ content: reply, ephemeral: false });
	},
}

