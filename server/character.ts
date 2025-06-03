import { CLASS_TYPE, GENDER_TYPE, RACE_TYPE, ZONE_TYPE } from "../src/lib/acoreMaps";

interface CharacterArgs {
	name: string;
	accountId: number;
	online: boolean;
	mapId: number;
	zone: ZONE_TYPE;
	class: CLASS_TYPE;
	race: RACE_TYPE;
	gender: GENDER_TYPE;
	level: number;
	guild?: GuildInfo;
}

class Character implements CharacterArgs {
	name: string;
	accountId: number;
	online: boolean;
	mapId: number;
	zone: ZONE_TYPE;
	class: CLASS_TYPE;
	race: RACE_TYPE;
	gender: GENDER_TYPE;
	level: number;
	guild?: GuildInfo | undefined;

	constructor({args}: {args: CharacterArgs}) {
		this.name = args.name;
		this.accountId = args.accountId;
		this.online = args.online;
		this.mapId = args.mapId;
		this.zone = args.zone;
		this.class = args.class
		this.race = args.race;
		this.gender = args.gender;
		this.level = args.level;
		this.guild = args.guild;
	}

}