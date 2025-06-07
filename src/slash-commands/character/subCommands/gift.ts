import { CommandInteraction } from "discord.js";
import { SlashCommandBuilder } from '@discordjs/builders';
import { Command } from "@azor/command";
import { executeSoapCommand, SOAP_COMMANDS } from "@azor/lib/executeSoapCommand";
import { GIFT_COOLDOWN, GIFT_ITEM_ENTRY } from "@azor.lib/options.env";
import { DB_HANDLER } from "@azor/lib/db";
// import { getItemByEntry } from "@azor/lib/ORM/Item";

export const gift: Command = {
	cmdData: new SlashCommandBuilder()
		.setName('gift')
		.setDescription(`Gift a character.`)
		.addStringOption(option => 
			option.setName('username')
				.setDescription("Character's name.")
				.setRequired(true)),
	async execute(commandInteraction: CommandInteraction) {
		const username = commandInteraction.options.getString('username') || ''; // TODO: sanitize input
		const db_discordAccount = commandInteraction.user

		const discordAccount = await DB_HANDLER.getDiscordAccount({ id: db_discordAccount.id, db_obj: db_discordAccount })

		try {
			const prettyMilliseconds = (await import('pretty-ms')).default;

			const character = await DB_HANDLER.getCharacter({ username, forceNoCache: true })

			const gift = await DB_HANDLER.getItem({ entry: GIFT_ITEM_ENTRY })
			const remainingCooldown = discordAccount.lastGift ? (GIFT_COOLDOWN + discordAccount.lastGift) - Date.now() : undefined
			// console.log('Remaining cooldown: ', remainingCooldown)

			// Handle successful promise resolution
			let reply = '';
			if (!character.online) {
				reply = `Character ${username} is not online.`;
		  } else if (character.level < 10) {
				reply = `Character ${username} is too low level to be gifted.`;
			} else if (remainingCooldown && remainingCooldown > 0) {
				reply = `You have gifted recently. Please wait before gifting again. Gift cooldown is ${prettyMilliseconds(GIFT_COOLDOWN)} seconds. There is ${prettyMilliseconds(remainingCooldown)} left until you can gift again.`;
			}

			if (reply) return commandInteraction.reply({ content: reply, ephemeral: true })


			executeSoapCommand[SOAP_COMMANDS.TIP_CHARACTER]({ args: { player_name: username } })
				.catch((error) => {
					console.error(`Error gifting character ${username}:`, error);
					reply = `Failed to gift character ${username}.`;
				});

			discordAccount.lastGift = Date.now();
			if (reply === '') reply = `${username} has been gifted ${ gift.name }.`;


			return commandInteraction.reply({ content: reply })

		} catch (error) {
			// Handle promise rejection
			console.error("Promise rejected:", error);
			return commandInteraction.reply({ content: `Character ${username} not found.`, ephemeral: true });

		}
	}
};