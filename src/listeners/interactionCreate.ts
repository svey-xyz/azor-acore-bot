import { CommandInteraction, Client, Interaction } from "discord.js";

export const interactionCreate = (client: Client): void => {
	client.on("interactionCreate", async (interaction: Interaction) => {
		if (interaction.isCommand()) handleCommand(client, interaction);
	});
};

const handleCommand = (client: any, interaction: CommandInteraction): void => {
	const command = client.commands.get(interaction.commandName);
	if (!command) {
		interaction.reply({ content: "An error has occurred", ephemeral: true });
		return;
	}

	try {
		command.execute(interaction);
	} catch (error) {
		console.error(error);
		interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
	}
};