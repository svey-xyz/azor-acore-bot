import { Client } from "discord.js";
import { deployCommands } from "@azor/commands";

export const ready = (client: Client): void => {
	client.on("ready", async () => {
		if (!client.user || !client.application) return;

		deployCommands(client);
		console.log(`${client.user.username} is online`);
	});
};