import { ChatInputCommandInteraction } from "discord.js";
import { isAzorApiOk } from "@azor/shared";
import { azorApiClient } from "@azor/lib/azorApiClient";
import { formatter, ORM_OBJECTS } from "@azor/lib/formatter";
import { SubCommand } from "@azor/subCommand";

export const location: SubCommand = {
	async execute(commandInteraction: ChatInputCommandInteraction) {
		const username = commandInteraction.options.getString("username", true);

		// Uses `character get` (full snapshot) rather than `character location`
		// because the formatter is keyed off the snapshot shape — the smaller
		// endpoint would just be re-broadened on the bot side. The SOAP cost
		// is the same.
		const env = await azorApiClient.characterGet(username);

		if (!isAzorApiOk(env)) {
			await commandInteraction.reply({ content: `Character ${username} not found.`, ephemeral: true });
			return;
		}

		const reply = formatter[ORM_OBJECTS.CHARACTER]({ args: { character: env.data, format: 'location' } });
		await commandInteraction.reply({ content: reply, ephemeral: false });
	},
}
