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
	return await addCachedCharacter(characters.get(username)!.char, forceNoCache);
}

export const getCharacterByDbCharacter = async (db_character: _character, forceNoCache: boolean = false): Promise<Character> => {
	if (!characters.has(db_character.name)) return updateCachedCharacterFromDb(db_character);
	return await addCachedCharacter(characters.get(db_character.name)!.char, forceNoCache);
}

const addCachedCharacter = async (character: Character, forceNoCache: boolean = false): Promise<Character> => {
	const username = character.name;
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

const updateCachedCharacterFromDb = (db_character: _character): Character => {
	const character = Character.createCharacterFromDb(db_character);
	characters.set(db_character.name, { age: Date.now(), char: character });

	return character;
}

const updateCachedCharacter = async (username: string): Promise<Character> => {
	const character = await Character.createCharacter(username);
	characters.set(username, { age: Date.now(), char: character });
	return character;
}

// export type CharacterORM_Type = typeof Character;

export class Character {
	private _name: string;
	private _accountId: number;
	private _online: boolean;
	private _mapId?: number;
	private _zone?: ZONE_TYPE;
	private _class: CLASS_TYPE;
	private _race: RACE_TYPE;
	private _gender: GENDER_TYPE;
	private _level: number;
	private _guild?: any | undefined; //TODO: Define GuildInfo type and use it here
	private _databaseCharacter: _character;

	private constructor({ db_character }: { db_character:_character}) {
		this._databaseCharacter = db_character;

		// Assign properties from the database character
		this._name = db_character.name;
		this._accountId = db_character.accountId; // TODO: Fetch account info
		this._online = db_character.online == 1;
		this._mapId = db_character.mapId || undefined; // Use mapId if it exists, otherwise undefined
		// If zoneId exists, map it to a zone name, otherwise set to undefined
		this._zone = db_character.zoneId ? AcoreTypeMaps.zoneName(db_character.zoneId) : undefined;
		this._class = AcoreTypeMaps.className(db_character.class);
		this._race = AcoreTypeMaps.raceName(db_character.race);
		this._gender = AcoreTypeMaps.genderName(db_character.gender);
		this._level = db_character.level;
		this._guild = db_character.guild // TODO: Fetch guild info
	}

	public static createCharacterFromDb = (db_character: _character) => {
		return new Character({ db_character });
	}

	public static createCharacter = async (username: string) => {
		const databaseCharacter = await db.query[QUERIES.GET_CHARACTER_BY_NAME]({ username });
		if (!databaseCharacter) throw new Error(`Error fetching character with name: ${username}.`);

		return new Character({ db_character: databaseCharacter });
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

	public get databaseCharacter(): _character { return this._databaseCharacter; }
}
