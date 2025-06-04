import { getDbClient } from "../db";
import { CLASS_TYPE, GENDER_TYPE, RACE_TYPE, ZONE_TYPE, AcoreTypeMaps } from "./AcoreTypeMaps";
import { QUERIES } from "server/queries";

const db = getDbClient()

type _c = {
	age: number,
	char: Character
}

const characters = new Map<string, _c>();

export const getCharacter = async (username: string, forceNoCache: boolean = false): Promise<Character> => {
	if (!characters.has(username)) return await updateCachedCharacter(username);

	const _c = characters.get(username)!;
	if (!_c) throw new Error(`Character not found in cache: ${username}`);
	let cacheDuration = 1000 * 60 * 5; // 5 minute default cache duration
	// If the character is online, reduce cache duration to 1 minute
	// This is to ensure that online characters are updated more frequently
	if (_c.char.online) cacheDuration = 1000 * 60 * 1;
	if (forceNoCache) cacheDuration = 0; // Force no cache
	// If the character is still within the cache duration, return it
	if (_c.age > Date.now() - cacheDuration) return _c.char
	else characters.delete(username); // Remove the character from cache if it has expired

	// Otherwise, fetch the character again
	return await updateCachedCharacter(username);
}

const updateCachedCharacter = async (username: string): Promise<Character> => {
	const character = await Character.createCharacter(username);
	characters.set(username, { age: Date.now(), char: character });
	return character;
}

type formatOptions = 'info'
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
		this._zone = AcoreTypeMaps.zoneName(db_character.zoneId);
		this._class = AcoreTypeMaps.className(db_character.class);
		this._race = AcoreTypeMaps.raceName(db_character.race);
		this._gender = AcoreTypeMaps.genderName(db_character.gender);
		this._level = db_character.level;
		this._guild = db_character.guild // TODO: Fetch guild info
	}

	public static createCharacter = async (username: string) => {
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

	private FormatCharacterInfo = (character: Character): string => {
		return `
**Character Information**
Name: ${character.name}
Level: ${character.level}
Race: ${character.race}
Class: ${character.class}
Gender: ${character.gender}
`.trim();
	}

	
	public formatOutput = (option: formatOptions) => {
		switch (option) {
			case 'info':
				return this.FormatCharacterInfo(this);
			default:
				throw new Error(`Unknown format option: ${option}`);
		}
	}
}
