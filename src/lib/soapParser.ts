import { emitWarning } from "process";
import { SOAP_COMMANDS } from "./soapCommands";

// ========================
// Parser Functions
// ========================

const parseCharacterData = (data: string): CharacterInfo => {
	const lines = data.split('\n');
	const result: Partial<CharacterInfo> = {
		arenaTeams: { '2v2': 0, '3v3': 0, '5v5': 0 }
	};

	for (const line of lines) {
		if (!line.trim() || !line.includes(':')) continue;

		const [keyPart, ...valueParts] = line.split(':');
		const key = keyPart.replace('|-', '').trim();
		const value = valueParts.join(':').trim();

		switch (key) {
			case 'Name':
				// Extract name without GUID info
				result.name = value.split('(')[0].trim();
				break;
			case 'Account':
				result.accountId = parseInt(value, 10);
				break;
			case 'Class':
				result.class = parseInt(value, 10);
				break;
			case 'Race':
				result.race = parseInt(value, 10);
				break;
			case 'Gender':
				result.gender = parseInt(value, 10);
				break;
			case 'Level':
				result.level = parseInt(value, 10);
				break;
			case 'Mail Count':
				result.mailCount = parseInt(value, 10);
				break;
			case 'Guild':
				result.guildId = parseInt(value, 10);
				break;
			case 'Group ID':
				// Extract Low value from GUID string
				const lowMatch = value.match(/Low: (\d+)/);
				if (lowMatch) result.groupId = parseInt(lowMatch[1], 10);
				break;
			case 'ArenaTeam 2x2':
				result.arenaTeams!['2v2'] = parseInt(value, 10);
				break;
			case 'ArenaTeam 3x3':
				result.arenaTeams!['3v3'] = parseInt(value, 10);
				break;
			case 'ArenaTeam 5x5':
				result.arenaTeams!['5v5'] = parseInt(value, 10);
				break;
		}
	}

	return result as CharacterInfo;
}

const parseGuildData = (data: string): GuildInfo => {
	const lines = data.split('\n');
	const result: Partial<GuildInfo> = {};

	// Process first line separately
	const firstLine = lines[0].trim();
	const guildMatch = firstLine.match(/Displaying Guild Details for (.+) \(Id: (\d+)\)/);
	if (guildMatch) {
		result.name = guildMatch[1].trim();
		result.id = parseInt(guildMatch[2], 10);
	}

	// Process remaining lines
	for (let i = 1; i < lines.length; i++) {
		const line = lines[i].trim();
		if (!line || !line.includes(':') || !line.startsWith('|')) continue;

		// Remove leading pipe and any dashes
		const cleanLine = line.replace(/^[\|\-\s]+/, '');
		const [key, ...valueParts] = cleanLine.split(':');
		const value = valueParts.join(':').trim();

		switch (key.trim()) {
			case 'Guild Master':
				result.master = value.split('(')[0].trim();
				break;
			case 'Guild Creation Date':
				result.creationDate = value;
				break;
			case 'Guild Members':
				result.memberCount = parseInt(value, 10);
				break;
			case 'Guild Bank':
				result.bankMoney = value;
				break;
			case 'Guild MOTD':
				result.motd = value;
				break;
			case 'Guild Information':
				result.info = value;
				break;
		}
	}

	return result as GuildInfo;
}



const parseOnlineCharacters = (data: string): OnlineCharacter[] => {
	const lines = data.split('\n').filter(line => line.trim() !== '');
	// Process character data lines
	const characters: OnlineCharacter[] = [];
	const dataLines = lines.filter(line => line.match(/^\-\[.+\]\-$/) && !line.includes('==='));

	for (const line of dataLines) {
		const values = line
			.split('][')
			.map(val => val.replace(/[\[\]-]/g, '').trim());

		if (values.length >= 7) {
			characters.push({
				account: values[0],
				character: values[1],
				ip: values[2],
				mapId: parseInt(values[3], 10),
				zoneId: parseInt(values[4], 10),
				expansion: parseInt(values[5], 10),
				gmLevel: parseInt(values[6], 10)
			});
		}
	}

	return characters;
}

const noParser = (data: string): string => {
	emitWarning(`No parser implemented for this command. Data: ${data}`);
	return data;
}


const SOAP_PARSERS_MAP: Record<SOAP_COMMANDS, (data: string) => any> = {
	[SOAP_COMMANDS.GET_SERVER_INFO]: noParser,
	[SOAP_COMMANDS.GET_SERVER_STATUS]: noParser,
	[SOAP_COMMANDS.GET_ONLINE_CHARACTERS]: parseOnlineCharacters,
	[SOAP_COMMANDS.GET_CHARACTER_INFO]: parseCharacterData,
	[SOAP_COMMANDS.GET_CHARACTER_LOCATION]: noParser,
	[SOAP_COMMANDS.GET_GUILD_INFO]: parseGuildData
}

export const soapParser = async <T>(command: SOAP_COMMANDS, data: string): Promise<T> => {
	const parser = SOAP_PARSERS_MAP[command];

	if (!parser) {
		throw new Error(`No parser defined for command: ${SOAP_COMMANDS[command]}`);
	}
	return parser(data) as T;
}