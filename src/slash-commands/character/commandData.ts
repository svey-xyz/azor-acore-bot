import { SlashCommandBuilder } from '@discordjs/builders';

export const commandData: any = new SlashCommandBuilder()
	.setName('character')
	.setDescription("Look-up character information.")
	.addSubcommand((subcommand: any) =>
		subcommand
			.setName('status')
			.setDescription(`Character's online status.`)
			.addStringOption(
				(option: any) =>
					option.setName('username')
						.setDescription(`Character's name.`)
						.setRequired(true)
			)
	)
	.addSubcommand((subcommand: any) =>
		subcommand
			.setName('location')
			.setDescription(`Character's location.`)
			.addStringOption(
				(option: any) =>
					option.setName('username')
						.setDescription(`Character's name.`)
						.setRequired(true)
			)
	)
	.addSubcommand((subcommand: any) =>
		subcommand
			.setName('info')
			.setDescription(`Character's info.`)
			.addStringOption(
				(option: any) =>
					option.setName('username')
						.setDescription(`Character's name.`)
						.setRequired(true)
			)
	)
	