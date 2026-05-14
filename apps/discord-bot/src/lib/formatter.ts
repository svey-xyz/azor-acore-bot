import type { AzorApiCharacterSnapshot } from "@azor/shared";
import { AcoreTypeMaps } from "@azor/lib/typeMaps";

/**
 * Stage 4 (2026-05-13): the bot now consumes `mod-azor-api` exclusively, so
 * the formatter takes `AzorApiCharacterSnapshot` straight from the API
 * envelope. The old `Character`/`Item`/`Realm` ORM and the `_character` row
 * shape are gone. `AcoreTypeMaps` (race/class/gender/zone display strings)
 * is all that survived; it now lives at `src/lib/typeMaps.ts`.
 */

export const formatBankMoney = (bankString: string): string => {
	return bankString === '0 gold' ? 'No gold' : bankString;
}

const GuildInfo = (guild: any): string => {
	return `
**Guild Information**
Name: ${guild.name}
Guild Master: ${guild.master}
Created: ${guild.creationDate}
Members: ${guild.memberCount}
Bank: ${formatBankMoney(guild.bankMoney)}
MOTD: ${guild.motd || "No message set"}
Info: ${guild.info}
`.trim();
}

const CharacterInfo = (character: AzorApiCharacterSnapshot): string => {
	return `
**Character Information**
Name: ${character.name}
Level: ${character.level}
Race: ${AcoreTypeMaps.raceName(character.race)}
Class: ${AcoreTypeMaps.className(character.class)}
Gender: ${AcoreTypeMaps.genderName(character.gender)}
`.trim();
}

const CharacterLocation = (character: AzorApiCharacterSnapshot): string => {
	if (character.online === false) return `**Character Location**\n${character.name} is currently offline.`;
	// zoneId 0 ≈ "no usable zone" (in-limbo / unloaded); preserve the legacy
	// behaviour of treating it as "data not available" rather than the
	// fallback "Unknown Zone" string.
	if (!character.zoneId) return `**Character Location**\n${character.name} data not available.`;
	const zone = AcoreTypeMaps.zoneName(character.zoneId);
	return `
**${character.name}'s Location**
Zone: ${zone}
`.trim();
}

const CharacterStatus = (character: AzorApiCharacterSnapshot): string => {
	return `
**Character Status**
Online: ${character.online ? "Yes" : "No"}
`.trim();
}

const RealmOnlineCharacters = (characters: AzorApiCharacterSnapshot[]): string => {
	return characters.length === 0
		? "No characters are currently online."
		:
`**Online Characters**
${characters.map(c => `${c.name}\n`).join('')}`
}

const RealmPop = (characters: AzorApiCharacterSnapshot[]): string => {
	return `**Realm Online Count: ** ${characters.length}`
}

export const enum ORM_OBJECTS {
	CHARACTER,
	GUILD,
	REALM
}

type ObjectFormatOptions = {
	[ORM_OBJECTS.CHARACTER]: 'info' | 'location' | 'status',
	[ORM_OBJECTS.REALM]: 'online' | 'pop'
};

const ObjectFormatFns = {
	[ORM_OBJECTS.CHARACTER]: {
		info: CharacterInfo,
		location: CharacterLocation,
		status: CharacterStatus
	},
	[ORM_OBJECTS.REALM]: {
		online: RealmOnlineCharacters,
		pop: RealmPop
	}
}


type formatArgs = {
	[ORM_OBJECTS.CHARACTER]: {
		character: AzorApiCharacterSnapshot,
		format: ObjectFormatOptions[ORM_OBJECTS.CHARACTER],
	},
	[ORM_OBJECTS.REALM]: {
		characters: AzorApiCharacterSnapshot[],
		format: ObjectFormatOptions[ORM_OBJECTS.REALM],
	}
}

export const formatter = {
	[ORM_OBJECTS.CHARACTER]: ({ args }: { args: formatArgs[ORM_OBJECTS.CHARACTER]}): string => {
		const formatFn = ObjectFormatFns[ORM_OBJECTS.CHARACTER][args.format];
		if (!formatFn) throw new Error("Invalid format option provided.");
		return formatFn(args.character);
	},
	[ORM_OBJECTS.REALM]: ({ args }: { args: formatArgs[ORM_OBJECTS.REALM]}): string => {
		const formatFn = ObjectFormatFns[ORM_OBJECTS.REALM][args.format];
		if (!formatFn) throw new Error("Invalid format option provided.");
		return formatFn(args.characters);
	}
}
