import { getDbClient } from "@azor/lib/db";
import { CLASS_TYPE, GENDER_TYPE, RACE_TYPE, ZONE_TYPE, AcoreTypeMaps, CLASS_MAP, RACE_MAP, GENDER_MAP } from "@azor.ORM/AcoreTypeMaps";
import { QUERIES } from "server/queries";
import { ORMObject } from "@azor/lib/ORM/ORMObject";

export class Character extends ORMObject<_character> {
	private _name: string = '';
	private _accountId: number = 0;
	private _online: boolean = false;
	private _mapId?: number;
	private _zone?: ZONE_TYPE;
	private _class: CLASS_TYPE = CLASS_MAP[0];
	private _race: RACE_TYPE = RACE_MAP[0];
	private _gender: GENDER_TYPE = GENDER_MAP[2];
	private _level: number = 0;
	private _guild?: any | undefined; //TODO: Define GuildInfo type and use it here

	constructor({ key, db_obj }: { key: string, db_obj:_character}) {
		super({ key, db_obj });
		this.update(key, db_obj);
	}

	public static override create = async (key: string, db_obj?: _character) => {
		if (db_obj) return new Character({ key, db_obj });

		const db = getDbClient()

		const databaseCharacters = await db.query[QUERIES.GET_CHARACTER_BY_NAME]({ username: key });
		if (!databaseCharacters || !databaseCharacters[0]) throw new Error(`Error fetching character with name: ${key}.`);

		return new Character({ key, db_obj: databaseCharacters[0] });
	}

	public async update(key: string, db_obj?: _character) {
		let db_obj_to_use = db_obj;

		if (!db_obj_to_use) {
			const db = getDbClient();
			db_obj_to_use = (await db.query[QUERIES.GET_CHARACTER_BY_NAME]({ username: key }))[0];
		}

		const DB_OBJ = db_obj_to_use as _character;
		if (!DB_OBJ) throw new Error(`Error fetching character with name: ${key}.`);

		this._name = DB_OBJ.name;
		this._accountId = DB_OBJ.account; // TODO: Fetch account info
		this._online = DB_OBJ.online == 1;
		this._mapId = DB_OBJ.map || undefined; // Use mapId if it exists, otherwise undefined
		// If zone exists, map it to a zone name, otherwise set to undefined
		this._zone = DB_OBJ.zone ? AcoreTypeMaps.zoneName(DB_OBJ.zone) : undefined;
		this._class = AcoreTypeMaps.className(DB_OBJ.class);
		this._race = AcoreTypeMaps.raceName(DB_OBJ.race);
		this._gender = AcoreTypeMaps.genderName(DB_OBJ.gender);
		this._level = DB_OBJ.level;
		// this._guild = db_character.gui // TODO: Fetch guild info
		
		super.update(key, DB_OBJ);
		return this;
	}


	public get name(): string { return this._name; }
	public get accountId(): number { return this._accountId; }
	public get online(): boolean { return this._online; }
	public get mapId(): number | undefined { return this._mapId;}
	public get zone(): ZONE_TYPE | undefined { return this._zone; }
	public get class(): CLASS_TYPE { return this._class; }
	public get race(): RACE_TYPE { return this._race; }
	public get gender(): GENDER_TYPE { return this._gender; }
	public get level(): number { return this._level; }
	public get guild(): any | undefined { return this._guild;}
}
