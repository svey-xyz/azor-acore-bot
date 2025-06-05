import { SlashCommandBuilder, SlashCommandStringOption, SlashCommandSubcommandBuilder } from '@discordjs/builders';

export const commandData = new SlashCommandBuilder()
	.setName('realm')
	.setDescription("Look-up realm information.")
	.addSubcommand((subcommand: SlashCommandSubcommandBuilder) =>
		subcommand
			.setName('status')
			.setDescription(`Realm status.`)
	)
	.addSubcommand((subcommand: SlashCommandSubcommandBuilder) =>
		subcommand
			.setName('characters')
			.setDescription(`List all realm characters.`)
	)
	.addSubcommand((subcommand: SlashCommandSubcommandBuilder) =>
		subcommand
			.setName('online')
			.setDescription(`List all online characters.`)
	)
	.addSubcommand((subcommand: SlashCommandSubcommandBuilder) =>
		subcommand
			.setName('pop')
			.setDescription(`Realm online population.`)
	)
