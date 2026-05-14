import {
	SlashCommandBuilder,
	SlashCommandIntegerOption,
	SlashCommandSubcommandBuilder,
	SlashCommandUserOption,
} from 'discord.js'

/**
 * `/admin …` — operator-only bot administration. Every subcommand is gated by
 * `adminOnly` in `admin.ts`; `setDefaultMemberPermissions(0)` additionally
 * hides the command from non-admins in the Discord client (defence in depth —
 * the runtime check is still authoritative).
 */
export const commandData = new SlashCommandBuilder()
	.setName('admin')
	.setDescription('Operator-only bot administration.')
	.setDefaultMemberPermissions(0)
	.addSubcommand((subcommand: SlashCommandSubcommandBuilder) =>
		subcommand
			.setName('grant-credits')
			.setDescription('Grant (or deduct) a user’s gift credits.')
			.addUserOption((option: SlashCommandUserOption) =>
				option
					.setName('user')
					.setDescription('The Discord user to adjust.')
					.setRequired(true),
			)
			.addIntegerOption((option: SlashCommandIntegerOption) =>
				option
					.setName('amount')
					.setDescription('Credits to grant; use a negative number to deduct.')
					.setRequired(true),
			),
	)
