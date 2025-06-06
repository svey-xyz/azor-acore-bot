import { getDbClient } from "@azor/lib/db";
import { CLASS_TYPE, GENDER_TYPE, RACE_TYPE, ZONE_TYPE, AcoreTypeMaps } from "@azor.ORM/AcoreTypeMaps";
import { QUERIES } from "server/queries";
import { ORMObject } from "@azor/lib/ORM/ORMObject";

export class Character extends ORMObject<_character> {
	private _name: string;
	private _accountId: number;
	private _online: boolean;
	private _mapId?: number;
	private _zone?: ZONE_TYPE;
	private _class: CLASS_TYPE;
	private _race: RACE_TYPE;
	private _gender: GENDER_TYPE;
	private _level: number;
	private _lastTip?: number; // Timestamp of the last time the character was updated
	private _guild?: any | undefined; //TODO: Define GuildInfo type and use it here

	constructor({ key, db_obj }: { key: string, db_obj:_character}) {
		super({ key, db_obj });
		// Assign properties from the database character
		this._name = db_obj.name;
		this._accountId = db_obj.account; // TODO: Fetch account info
		this._online = db_obj.online == 1;
		this._mapId = db_obj.map || undefined; // Use mapId if it exists, otherwise undefined
		// If zone exists, map it to a zone name, otherwise set to undefined
		this._zone = db_obj.zone ? AcoreTypeMaps.zoneName(db_obj.zone) : undefined;
		this._class = AcoreTypeMaps.className(db_obj.class);
		this._race = AcoreTypeMaps.raceName(db_obj.race);
		this._gender = AcoreTypeMaps.genderName(db_obj.gender);
		this._level = db_obj.level;
		// this._guild = db_character.gui // TODO: Fetch guild info
	}

	public static createCharacterFromDb = (db_obj: _character) => {
		return new Character({ key: db_obj.name, db_obj });
	}

	public static createFromKey = async (key: string) => {
		const db = getDbClient()

		const databaseCharacters = await db.query[QUERIES.GET_CHARACTER_BY_NAME]({ username: key });
		if (!databaseCharacters || !databaseCharacters[0]) throw new Error(`Error fetching character with name: ${key}.`);

		return new Character({ key, db_obj: databaseCharacters[0] });
	}

	public set lastTip(time: number | undefined) { this._lastTip = time;}

	public get name(): string { return this._name; }
	public get accountId(): number { return this._accountId; }
	public get online(): boolean { return this._online; }
	public get mapId(): number | undefined { return this._mapId;}
	public get zone(): ZONE_TYPE | undefined { return this._zone; }
	public get class(): CLASS_TYPE { return this._class; }
	public get race(): RACE_TYPE { return this._race; }
	public get gender(): GENDER_TYPE { return this._gender; }
	public get level(): number { return this._level; }
	public get lastTip(): number | undefined { return this._lastTip; }
	public get guild(): any | undefined { return this._guild;}
}
