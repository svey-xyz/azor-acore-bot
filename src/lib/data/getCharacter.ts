import { getDbClient } from "../db";
import { CLASS_TYPE, GENDER_TYPE, RACE_TYPE, ZONE_TYPE, AcoreMapHelper } from "../acoreMaps";
import { QUERIES } from "server/queries";

const db = getDbClient()

export class Character {
	private _name: string;
	private _accountId: number;
	private _online: boolean;
	private _mapId: number;
	private _zone: ZONE_TYPE;
	private _class: CLASS_TYPE;
	private _race: RACE_TYPE;
	private _gender: GENDER_TYPE;
	private _level: number;
	private _guild?: GuildInfo | undefined;
	private _databaseCharacter: _character;

	private constructor({ db_character }: { db_character:_character}) {
		this._databaseCharacter = db_character;

		// Assign properties from the database character
		this._name = db_character.name;
		this._accountId = db_character.accountId; // TODO: Fetch account info
		this._online = db_character.online == 1;
		this._mapId = db_character.mapId;
		this._zone = AcoreMapHelper.zoneName(db_character.zoneId);
		this._class = AcoreMapHelper.className(db_character.class);
		this._race = AcoreMapHelper.raceName(db_character.race);
		this._gender = AcoreMapHelper.genderName(db_character.gender);
		this._level = db_character.level;
		this._guild = db_character.guild // TODO: Fetch guild info
	}

	public static async createCharacter(username: string) {
		const databaseCharacter = await db.query(QUERIES.GET_CHARACTER_BY_NAME, { username });
		if (!databaseCharacter) throw new Error(`Error fetching character with name: ${username}.`);

		return new Character({ db_character: databaseCharacter });
	}

	public get name(): string { return this._name; }
	public get accountId(): number { return this._accountId; }
	public get online(): boolean { return this._online; }
	public get mapId(): number { return this._mapId;}
	public get zone(): ZONE_TYPE { return this._zone; }
	public get class(): CLASS_TYPE { return this._class; }
	public get race(): RACE_TYPE { return this._race; }
	public get gender(): GENDER_TYPE { return this._gender; }
	public get level(): number { return this._level; }
	public get guild(): GuildInfo | undefined { return this._guild;}

	public get databaseCharacter(): _character { return this._databaseCharacter; }
}