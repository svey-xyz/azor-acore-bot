import { SelectMenuInteraction, CommandInteraction, ButtonInteraction } from "discord.js";

export interface Command {
	cmdData: any,
	execute(interaction: CommandInteraction): void,
	select?(interaction: SelectMenuInteraction): void
	button?(interaction: ButtonInteraction): void

}