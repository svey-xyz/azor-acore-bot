import { SlashCommandBuilder, SlashCommandStringOption, SlashCommandSubcommandBuilder } from '@discordjs/builders';

export const commandData = new SlashCommandBuilder()
	.setName('character')
	.setDescription("Look-up character information.")
	.addSubcommand((subcommand: SlashCommandSubcommandBuilder) =>
		subcommand
			.setName('status')
			.setDescription(`Character's online status.`)
			.addStringOption(
				(option: SlashCommandStringOption) =>
					option.setName('username')
						.setDescription(`Character's name.`)
						.setRequired(true)
			)
	)
	.addSubcommand((subcommand: SlashCommandSubcommandBuilder) =>
		subcommand
			.setName('location')
			.setDescription(`Character's location.`)
			.addStringOption(
				(option: SlashCommandStringOption) =>
					option.setName('username')
						.setDescription(`Character's name.`)
						.setRequired(true)
			)
	)
	.addSubcommand((subcommand: SlashCommandSubcommandBuilder) =>
		subcommand
			.setName('info')
			.setDescription(`Character's info.`)
			.addStringOption(
				(option: SlashCommandStringOption) =>
					option.setName('username')
						.setDescription(`Character's name.`)
						.setRequired(true)
			)
	)
	.addSubcommand((subcommand: SlashCommandSubcommandBuilder) =>
		subcommand
			.setName('gift')
			.setDescription(`Gift a character.`)
			.addStringOption(
				(option: SlashCommandStringOption) =>
					option.setName('username')
						.setDescription(`Character's name.`)
						.setRequired(true)
			)
	)
