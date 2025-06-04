import { Character } from "src/lib/ORM/Character";
import { AcoreTypeMaps } from "../../../lib/ORM/AcoreTypeMaps";

export const formatCharacterOutput = (character: Character): string => {
	return `
**Character Information**
Name: ${character.name}
Level: ${character.level}
Race: ${character.race}
Class: ${character.class}
Gender: ${character.gender}
`.trim();
}


export const formatBankMoney = (bankString: string): string => {
	return bankString === '0 gold' ? 'No gold' : bankString;
}

export const formatGuildOutput = (data: GuildInfo): string => {
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