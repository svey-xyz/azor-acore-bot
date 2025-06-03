import { CommandInteraction, Interaction, Permissions } from "discord.js";

export function adminOnly(interaction: CommandInteraction): boolean {
	const isAdmin = (<Readonly<Permissions>>interaction.member?.permissions).has(Permissions.FLAGS.ADMINISTRATOR);

	if (!isAdmin) interaction.reply({ content: "This command is for admins only!", ephemeral: true })

	return isAdmin;
}