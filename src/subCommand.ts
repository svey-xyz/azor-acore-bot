import { SelectMenuInteraction, CommandInteraction, ButtonInteraction } from "discord.js";

export interface SubCommand {
	execute(interaction: CommandInteraction): void,
	selectHandler?(interaction: SelectMenuInteraction): void
	buttonHandler?(interaction: ButtonInteraction): void

}