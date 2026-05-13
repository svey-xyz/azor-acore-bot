import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ChatInputCommandInteraction,
	type Interaction,
	type MessageActionRowComponentBuilder,
	SlashCommandBuilder,
} from 'discord.js';
import { AZOR_API_ERROR_CODES, isAzorApiOk } from '@azor/shared';
import { azorApiClient } from '@azor/lib/azorApiClient';
import { Command } from '@azor/command';

/**
 * `/character gift <username>`
 *
 * Stage 3: cooldown, min-level, and the actual item dispatch are all enforced
 * server-side by `mod-azor-api`. This handler is now a thin confirmation UI
 * around `azorApiClient.characterInteract({ type: 'gift', ... })`. Friendly
 * messages map from the module's structured error codes.
 *
 * The bot no longer tracks `lastGift` locally — the module's audit table
 * (`mod_azor_api_interactions`) is the single source of truth for cooldown.
 */
export const gift: Command = {
	cmdData: new SlashCommandBuilder()
		.setName('gift')
		.setDescription('Gift a character.')
		.addStringOption((option) =>
			option
				.setName('username')
				.setDescription("Character's name.")
				.setRequired(true),
		),
	async execute(commandInteraction: ChatInputCommandInteraction) {
		const username = commandInteraction.options.getString('username', true);

		const confirm = new ButtonBuilder()
			.setCustomId('confirm')
			.setLabel('Confirm Gift')
			.setStyle(ButtonStyle.Success);
		const cancel = new ButtonBuilder()
			.setCustomId('cancel')
			.setLabel('Cancel')
			.setStyle(ButtonStyle.Secondary);
		const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
			cancel,
			confirm,
		);

		const response = await commandInteraction.reply({
			content: `Send a gift to **${username}**? Daily cooldown applies and is enforced by the server.`,
			ephemeral: true,
			withResponse: true,
			components: [row],
		});

		const filter = (i: Interaction) => i.user.id === commandInteraction.user.id;

		let confirmation;
		try {
			confirmation = await response.resource?.message?.awaitMessageComponent({
				filter,
				time: 60_000,
			});
		} catch {
			await commandInteraction.editReply({
				content: 'Confirmation not received within 1 minute, cancelling.',
				components: [],
			});
			return;
		}

		if (!confirmation || confirmation.customId === 'cancel') {
			await confirmation?.update({ content: 'Action cancelled.', components: [] });
			return;
		}

		// Authoritative call: the module enforces everything.
		const env = await azorApiClient.characterInteract({
			name: username,
			type: 'gift',
			sourceType: 'discord',
			sourceId: commandInteraction.user.id,
		});

		if (isAzorApiOk(env)) {
			const prettyMs = (await import('pretty-ms')).default;
			const cooldownNote = env.data.cooldownMs > 0
				? ` You can gift again in ${prettyMs(env.data.cooldownMs)}.`
				: '';
			await confirmation.update({
				content: `${username} has been gifted.${cooldownNote}`,
				components: [],
			});
			return;
		}

		await confirmation.update({
			content: friendlyError(username, env.error),
			components: [],
		});
	},
};

function friendlyError(
	username: string,
	error: { code: string; message: string },
): string {
	switch (error.code) {
		case AZOR_API_ERROR_CODES.notFound:
			return `Character **${username}** was not found.`;
		case AZOR_API_ERROR_CODES.minLevel:
			return `Character **${username}** is too low level to be gifted (${error.message}).`;
		case AZOR_API_ERROR_CODES.cooldown: {
			// The module surfaces "<N> ms remaining" in `message`. Reformat with pretty-ms
			// if we can pull a number out; fall back to the raw message otherwise.
			const match = error.message.match(/^(\d+)\s*ms/);
			if (match) {
				const ms = Number(match[1]);
				return `You have gifted **${username}** recently. Try again in ~${humanise(ms)}.`;
			}
			return `Gift is on cooldown: ${error.message}.`;
		}
		case AZOR_API_ERROR_CODES.disabled:
			return 'Gifting is currently disabled on the server.';
		case AZOR_API_ERROR_CODES.invalidArg:
			return `Could not gift **${username}**: ${error.message}.`;
		default:
			return `Failed to gift **${username}** (${error.code}): ${error.message}.`;
	}
}

function humanise(ms: number): string {
	// Lightweight inline formatter to avoid an extra async import on the error
	// path. Approximates pretty-ms granularity well enough for this surface.
	const sec = Math.round(ms / 1000);
	if (sec < 60) return `${sec}s`;
	const min = Math.round(sec / 60);
	if (min < 60) return `${min}m`;
	const hr = Math.round(min / 60);
	if (hr < 24) return `${hr}h`;
	const day = Math.round(hr / 24);
	return `${day}d`;
}
