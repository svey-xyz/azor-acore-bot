// ========================
// Type Definitions
// ========================

interface Character {
	name: string;
	accountId: number;
	online: boolean;
	mapId: number;
	zoneId: number;
	class: string;
	race: string;
	gender: string;
	level: number;
	guild?: GuildInfo;
}

interface GuildInfo {
	name: string;
	id: number;
	master: string;
	creationDate: string;
	memberCount: number;
	bankMoney: string;
	motd: string;
	info: string;
}

interface CharacterInfo {
	name: string;
	accountId: number;
	class: number;
	race: number;
	gender: number;
	level: number;
	mailCount: number;
	guildId: number;
	groupId: number;
	arenaTeams: {
		'2v2': number;
		'3v3': number;
		'5v5': number;
	};
}

interface OnlineCharacter {
	account: string;
	character: string;
	ip: string;
	mapId: number;
	zoneId: number;
	expansion: number;
	gmLevel: number;
}

