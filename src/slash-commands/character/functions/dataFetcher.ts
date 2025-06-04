import { formatCharacterOutput } from "../functions/formatter";
import { executeSoapCommand } from "../../../lib/executeSoapCommand"
import { SOAP_COMMANDS } from "../../../lib/soapCommands";
import { AcoreMapHelper } from "../../../lib/acoreMaps";
import { DATABASE } from "../../../../server/DATABASE";
import { QUERIES } from "server/queries";

const db = new DATABASE();


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
	const character = await db.query(QUERIES.GET_CHARACTER_BY_NAME, { username });
	if (character == null) {
		throw new Error(`Error fetching character data.`);
	}
	const zoneID = character.zone;

	if (!character || !zoneID) {
		return `Character **${username}** is not online or does not have a valid zone ID.`;
	}

	const zoneName = AcoreMapHelper.zoneName(zoneID);

	return `**${username}** is currently in **${zoneName}**.`;
}