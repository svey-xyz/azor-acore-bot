import { ChatInputCommandInteraction } from "discord.js";
import { isAzorApiOk } from "@azor/shared";
import { azorApiClient } from "@azor/lib/azorApiClient";
import { formatter, ORM_OBJECTS } from "@azor/lib/formatter";
import { SubCommand } from "@azor/subCommand";

export const online: SubCommand = {
	async execute(commandInteraction: ChatInputCommandInteraction) {
		const env = await azorApiClient.realmOnline();

		if (!isAzorApiOk(env)) {
			await commandInteraction.reply({
				content: `Failed to fetch online characters: ${env.error.message}`,
				ephemeral: true,
			});
			return;
		}

		const reply = formatter[ORM_OBJECTS.REALM]({
			args: { characters: env.data.characters, format: 'online' },
		});
		await commandInteraction.reply({ content: reply, ephemeral: false });
	},
}
