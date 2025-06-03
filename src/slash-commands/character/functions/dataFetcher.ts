import { formatCharacterOutput } from "../functions/formatter";
import { executeSoapCommand } from "../../../lib/executeSoapCommand"
import { SOAP_COMMANDS } from "../../../lib/soapCommands";
import { AcoreMapHelper } from "../../../lib/acoreMaps";

export const characterStatus = async (username: string) => {
	const info = await executeSoapCommand<OnlineCharacter[]>({ command: SOAP_COMMANDS.GET_ONLINE_CHARACTERS, args: { player_name: username } });
	if (info instanceof Error) {
		throw new Error(`Error fetching character status: ${info.message}`);
	}
	if (!info || info.length === 0) {
		return `No characters online!`
	}
	const online =  info.some(character => character.character.toLowerCase() === username.toLowerCase());
	if (online) return `**${username}** is online!`;
	return `**${username}** is offline.`;
}

export const CharacterInfo = async (username: string) => {
	const _info = await executeSoapCommand<CharacterInfo>({ command: SOAP_COMMANDS.GET_CHARACTER_INFO, args: { player_name: username } });
	if (_info instanceof Error) {
		throw new Error(`Error fetching character info: ${_info.message}`);
	}
	if (!_info) {
		return `Character **${username}** not found.`;
	}

	const INFO = formatCharacterOutput(_info);
	return INFO;
}

export const CharacterLocation = async (username: string) => {
	const CharacterData = await executeSoapCommand<OnlineCharacter[]>({ command: SOAP_COMMANDS.GET_ONLINE_CHARACTERS, args: {} });
	const character = CharacterData?.find(character => character.character.toLowerCase() === username.toLowerCase());
	const zoneID = character?.zoneId;

	if (!character || !zoneID) {
		return `Character **${username}** is not online or does not have a valid zone ID.`;
	}

	const zoneName = AcoreMapHelper.zoneName(zoneID);

	return `**${username}** is currently in **${zoneName}**.`;
}