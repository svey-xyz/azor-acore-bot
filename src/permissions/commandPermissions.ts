import { CommandInteraction, PermissionFlagsBits, PermissionsBitField } from "discord.js";

export function adminOnly(interaction: CommandInteraction): boolean {
	const isAdmin = (interaction.member?.permissions as PermissionsBitField).has(PermissionFlagsBits.Administrator);

	if (!isAdmin) interaction.reply({ content: "This command is for admins only!", ephemeral: true })

	return isAdmin;
}