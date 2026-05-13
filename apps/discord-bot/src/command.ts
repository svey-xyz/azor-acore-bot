import { ChatInputCommandInteraction, ButtonInteraction, StringSelectMenuInteraction, SlashCommandBuilder, SlashCommandSubcommandsOnlyBuilder, SlashCommandOptionsOnlyBuilder } from "discord.js";

export interface Command {
	cmdData: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder | SlashCommandOptionsOnlyBuilder,
	execute(interaction: ChatInputCommandInteraction): void,
	select?(interaction: StringSelectMenuInteraction): void
	button?(interaction: ButtonInteraction): void
}