import { SlashCommandBuilder, SlashCommandSubcommandBuilder } from 'discord.js'

export const commandData = new SlashCommandBuilder()
	.setName('account')
	.setDescription('Link or inspect your in-game account binding.')
	.addSubcommand((subcommand: SlashCommandSubcommandBuilder) =>
		subcommand
			.setName('link')
			.setDescription('Generate a one-time code to bind your Discord account to a WoW account.'),
	)
	.addSubcommand((subcommand: SlashCommandSubcommandBuilder) =>
		subcommand
			.setName('whoami')
			.setDescription("Show which WoW account (if any) is bound to your Discord identity."),
	)
