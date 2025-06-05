import { Character } from "./ORM/Character";

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

const CharacterInfo = (character: Character): string => {
	return `
**Character Information**
Name: ${character.name}
Level: ${character.level}
Race: ${character.race}
Class: ${character.class}
Gender: ${character.gender}
`.trim();
}

const CharacterLocation = (character: Character): string => {
	if (character.online === false) return `**Character Location**\n${character.name} is currently offline.`;
	if (!character.zone) return `**Character Location**\n${character.name} data not available.`;
	return `
**Character Location**
Map ID: ${character.mapId}
Zone: ${character.zone}
`.trim();
}

const CharacterStatus = (character: Character): string => {
	return `
**Character Status**
Online: ${character.online ? "Yes" : "No"}
`.trim();
}

const RealmOnlineCharacters = (characters: Character[]): string => {
	return characters.length === 0
		? "No characters are currently online."
		:
`**Online Characters**
${characters.map(c => `${c.name}\n`)}`
}

const RealmPop = (characters: Character[]): string => {
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
		character: Character,
		format: ObjectFormatOptions[ORM_OBJECTS.CHARACTER],
	},
	[ORM_OBJECTS.REALM]: {
		characters: Character[],
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