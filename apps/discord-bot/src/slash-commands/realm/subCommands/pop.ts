import { ChatInputCommandInteraction } from "discord.js";
import { isAzorApiOk } from "@azor/shared";
import { azorApiClient } from "@azor/lib/azorApiClient";
import { SubCommand } from "@azor/subCommand";

export const pop: SubCommand = {
	async execute(commandInteraction: ChatInputCommandInteraction) {
		// `realm population` is the cheap variant — server returns just `{ online: N }`.
		const env = await azorApiClient.realmPopulation();

		if (!isAzorApiOk(env)) {
			await commandInteraction.reply({
				content: `Failed to fetch realm population: ${env.error.message}`,
				ephemeral: true,
			});
			return;
		}

		await commandInteraction.reply({
			content: `**Realm Online Count: ** ${env.data.online}`,
			ephemeral: false,
		});
	},
}
