import { StringSelectMenuInteraction, ChatInputCommandInteraction, ButtonInteraction } from "discord.js";

export interface SubCommand {
	execute(interaction: ChatInputCommandInteraction): void,
	selectHandler?(interaction: StringSelectMenuInteraction): void
	buttonHandler?(interaction: ButtonInteraction): void

}