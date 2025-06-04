import { status } from "src/slash-commands/character/subCommands/status";
import { Character } from "./ORM/Character";

export const formatBankMoney = (bankString: string): string => {
	return bankString === '0 gold' ? 'No gold' : bankString;
}

export const formatGuildOutput = (data: any): string => {
	return `
**Guild Information**
Name: ${data.name}
Guild Master: ${data.master}
Created: ${data.creationDate}
Members: ${data.memberCount}
Bank: ${formatBankMoney(data.bankMoney)}
MOTD: ${data.motd || "No message set"}
Info: ${data.info}
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

export const enum ORM_OBJECTS {
	CHARACTER,
	GUILD,
}

type ObjectFormatOptions = {
	[ORM_OBJECTS.CHARACTER]: 'info' | 'location' | 'status',
};

const ObjectFormatFns = {
	[ORM_OBJECTS.CHARACTER]: {
		info: CharacterInfo,
		location: CharacterLocation,
		status: CharacterStatus
	},
}


type formatArgs = {
	[ORM_OBJECTS.CHARACTER]: {
		character: Character,
		format: ObjectFormatOptions[ORM_OBJECTS.CHARACTER],
	},
}

export const formatter = {
	[ORM_OBJECTS.CHARACTER]: ({ args }: { args: formatArgs[ORM_OBJECTS.CHARACTER]}): string => {
		const formatFn = ObjectFormatFns[ORM_OBJECTS.CHARACTER][args.format];
		if (!formatFn) throw new Error("Invalid format option provided.");
		return formatFn(args.character);
	}
}