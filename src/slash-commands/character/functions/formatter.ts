import { AcoreMapHelper } from "../../../lib/acoreMaps";

export const formatCharacterOutput = (data: CharacterInfo): string => {
	return `
**Character Information**
Name: ${data.name}
Level: ${data.level}
Race: ${AcoreMapHelper.raceName(data.race)}
Class: ${AcoreMapHelper.className(data.class)}
Gender: ${AcoreMapHelper.genderName(data.gender)}
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