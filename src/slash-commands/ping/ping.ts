import { BaseCommandInteraction, MessageEmbed, Client } from "discord.js";
import { SlashCommandBuilder } from '@discordjs/builders';
import { Command } from "../../command";

const commandData: any = new SlashCommandBuilder()
	.setName('ping')
	.setDescription("Friendly reply.")

const ping: Command = {
	cmdData: commandData,
	async execute(interaction: BaseCommandInteraction) {
		const embed = new MessageEmbed().setDescription('Pong!');

		await interaction.reply({ embeds: [embed], ephemeral: true })
			.catch(console.error);
	}
};

module.exports = ping;