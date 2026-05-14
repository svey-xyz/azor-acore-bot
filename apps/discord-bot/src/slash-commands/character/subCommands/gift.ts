import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ChatInputCommandInteraction,
	EmbedBuilder,
	type Interaction,
	type MessageActionRowComponentBuilder,
	SlashCommandBuilder,
} from 'discord.js';
import { AZOR_API_ERROR_CODES, isAzorApiOk } from '@azor/shared';
import { azorApiClient } from '@azor/lib/azorApiClient';
import { getDiscordUser, recordGiftSpend } from '@azor/lib/botDb';
import { evaluateGiftPolicy, humaniseMs } from '@azor/lib/giftPolicy';
import { Command } from '@azor/command';

/**
 * `/character gift <username>`
 *
 * Two enforcement layers, in order:
 *   1. Bot-side policy (Stage 6) — credits + per-Discord-user cooldown,
 *      evaluated by `evaluateGiftPolicy`. Out-of-credit / on-cooldown users
 *      are rejected here and never reach the module.
 *   2. Module-side (Stage 3) — per-character cooldown, min-level, and the
 *      actual item dispatch, enforced atomically by `mod-azor-api`.
 *
 * The confirmation embed surfaces *both* cooldowns (per-Discord-user and
 * per-character) so the user sees the full picture before confirming. The
 * per-character figure is a read probe — the module re-checks it atomically
 * on `interact`, so a stale probe can't let a gift slip through.
 *
 * A bot-side credit is consumed (and the per-user cooldown stamped) only
 * *after* the module confirms the gift, via the atomic `recordGiftSpend`.
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
		const discordUserId = commandInteraction.user.id;

		// ── 1. Bot-side policy gate ─────────────────────────────────────────────
		// Runs before any SOAP call: out-of-credit / on-cooldown users get a
		// clean rejection without ever touching the module.
		const policy = await evaluateGiftPolicy(discordUserId);
		if (!policy.allowed) {
			await commandInteraction.reply({ content: policy.reason!, ephemeral: true });
			return;
		}

		await commandInteraction.deferReply({ ephemeral: true });

		// ── 2. Per-character cooldown probe ─────────────────────────────────────
		// Informational only — surfaced in the confirmation embed. The module
		// re-checks atomically on `interact`.
		let charCooldownRemainingMs = 0;
		try {
			const cdEnv = await azorApiClient.characterCooldown({
				name: username,
				type: 'gift',
			});
			if (isAzorApiOk(cdEnv)) charCooldownRemainingMs = cdEnv.data.remainingMs;
			// A not_found / error here isn't fatal — let the `interact` call below
			// surface the real, structured error to the user.
		} catch (err) {
			console.error('[character gift] cooldown probe failed:', err);
		}

		// ── 3. Confirmation embed with both timers ──────────────────────────────
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

		const message = await commandInteraction.editReply({
			embeds: [buildConfirmEmbed(username, policy, charCooldownRemainingMs)],
			components: [row],
		});

		const filter = (i: Interaction) => i.user.id === discordUserId;

		let confirmation;
		try {
			confirmation = await message.awaitMessageComponent({ filter, time: 60_000 });
		} catch {
			await commandInteraction.editReply({
				content: 'Confirmation not received within 1 minute, cancelling.',
				embeds: [],
				components: [],
			});
			return;
		}

		if (confirmation.customId === 'cancel') {
			await confirmation.update({
				content: 'Action cancelled.',
				embeds: [],
				components: [],
			});
			return;
		}

		// ── 4. Re-check policy ──────────────────────────────────────────────────
		// The confirm button can be pressed up to 60s after the initial gate;
		// in that window the user could have spent their last credit on another
		// gift, or had credits revoked by an admin.
		const recheck = await evaluateGiftPolicy(discordUserId);
		if (!recheck.allowed) {
			await confirmation.update({
				content: recheck.reason!,
				embeds: [],
				components: [],
			});
			return;
		}

		// ── 5. Authoritative module call ────────────────────────────────────────
		const env = await azorApiClient.characterInteract({
			name: username,
			type: 'gift',
			sourceType: 'discord',
			sourceId: discordUserId,
		});

		if (!isAzorApiOk(env)) {
			await confirmation.update({
				content: friendlyError(username, env.error),
				embeds: [],
				components: [],
			});
			return;
		}

		// ── 6. Bill the sender ──────────────────────────────────────────────────
		// Module confirmed the gift — now consume a credit and stamp the per-user
		// cooldown. `recordGiftSpend` is atomic; a false result means the credit
		// was spent concurrently (the gift still went through — the module is the
		// side-effecting authority — so we log and carry on rather than fail).
		const spent = await recordGiftSpend(discordUserId, Date.now());
		if (!spent) {
			console.error(
				`[character gift] recordGiftSpend was a no-op for ${discordUserId} — ` +
					'credit spent concurrently; gift delivered un-billed.',
			);
		}

		const after = await getDiscordUser(discordUserId);
		await confirmation.update({
			content: '',
			embeds: [
				buildSuccessEmbed(
					username,
					after?.giftCredits ?? Math.max(0, recheck.credits - 1),
					recheck.userCooldownMs,
					env.data.cooldownMs,
				),
			],
			components: [],
		});
	},
};

// ---------------------------------------------------------------------------
// Embeds
// ---------------------------------------------------------------------------

function buildConfirmEmbed(
	username: string,
	policy: { credits: number; userCooldownMs: number },
	charCooldownRemainingMs: number,
): EmbedBuilder {
	return new EmbedBuilder()
		.setTitle(`Gift ${username}?`)
		.setDescription(
			'Confirm to send a gift. Both cooldowns below are enforced by the server.',
		)
		.addFields(
			{
				name: 'Your gift credits',
				value: `${policy.credits}`,
				inline: true,
			},
			{
				name: 'Your cooldown',
				value: `${humaniseMs(policy.userCooldownMs)} between gifts`,
				inline: true,
			},
			{
				name: `${username}'s cooldown`,
				value:
					charCooldownRemainingMs > 0
						? `on cooldown — ${humaniseMs(charCooldownRemainingMs)} left`
						: 'ready to receive',
				inline: true,
			},
		);
}

function buildSuccessEmbed(
	username: string,
	creditsRemaining: number,
	userCooldownMs: number,
	charCooldownMs: number,
): EmbedBuilder {
	return new EmbedBuilder()
		.setTitle(`${username} has been gifted`)
		.addFields(
			{
				name: 'Your gift credits',
				value: `${creditsRemaining} remaining`,
				inline: true,
			},
			{
				name: 'You can gift again in',
				value: userCooldownMs > 0 ? `~${humaniseMs(userCooldownMs)}` : 'no cooldown',
				inline: true,
			},
			{
				name: `${username} can be gifted again in`,
				value: charCooldownMs > 0 ? `~${humaniseMs(charCooldownMs)}` : 'no cooldown',
				inline: true,
			},
		);
}

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

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
			// The module surfaces "<N> ms remaining" in `message`. Reformat with
			// humaniseMs if we can pull a number out; fall back to the raw message.
			const match = error.message.match(/^(\d+)\s*ms/);
			if (match) {
				const ms = Number(match[1]);
				return `**${username}** was gifted recently. Try again in ~${humaniseMs(ms)}.`;
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
