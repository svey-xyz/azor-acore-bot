import { DATABASE } from "@azor.server/DATABASE";
import { Character } from "@azor/lib/ORM/Character";
import { DiscordAccount } from "@azor/lib/ORM/DiscordAccount";
import { Item } from "@azor/lib/ORM/Item";
import { ORMObject } from "@azor/lib/ORM/ORMObject";
import { Realm } from "@azor/lib/ORM/Realm";

let db: DATABASE | undefined;
// Singleton pattern to ensure only one instance of DATABASE is created

export const getDbClient = () => {
	if (!db) db = new DATABASE();
	return db;
}


type cacheNames = 'characters' | 'items' | 'discordAccounts'

type getCachedObjectParams<T> = {
	fn: (key: string, db_obj?: any) => Promise<T>
	cacheDuration?: number,
	forceNoCache?: boolean,
}

type age = number
type cachedObject<T> = {
	age: age,
	obj: T
}


class DataHandler {
	private _realm = new Realm()
	private _defaultCacheDuration: number = 100000;
	private _characters = new Map<string, cachedObject<Character>>()
	private _items = new Map<string, cachedObject<Item>>()
	private _discordAccounts = new Map<string, cachedObject<DiscordAccount>>()

	private _cache = new Map<cacheNames, Map<string, cachedObject<ORMObject<{}>>>>()

	constructor() {
		this._cache.set('characters', this._characters)
		this._cache.set('items', this._items)
		this._cache.set('discordAccounts', this._discordAccounts)

	}
	public get realm(): Realm { return this._realm; }
	public getCharacter = async ({
		username, db_obj, cacheDuration = this._defaultCacheDuration, forceNoCache = false
	}:{
		username: string, db_obj?:{}, cacheDuration?: number, forceNoCache?: boolean
	}): Promise<Character> => {
		const c = await this.getCachedData<Character>({ cache: 'characters', key: username, fn: Character.createFromKey, db_obj, cacheDuration, forceNoCache})
		if (c?.obj && typeof c.obj == typeof Character) return c?.obj as Character
		return Promise.reject(new Error(`Error fetching character ${username}`))
	}

	public getItem = async ({
		entry, db_obj, cacheDuration = this._defaultCacheDuration, forceNoCache = false
	} : {
		entry: number, db_obj?: {}, cacheDuration?: number, forceNoCache?: boolean
	}): Promise<Item> => {
		const i = await this.getCachedData<Item>({ cache: 'items', key: String(entry), fn: Item.createFromKey, db_obj, cacheDuration, forceNoCache })
		if (i?.obj && typeof i.obj == typeof Item) return i?.obj as Item
		return Promise.reject(new Error(`Error fetching item with entry ${entry}`))
	}

	
	getCachedData = async <T extends ORMObject<{}>>
	({
		cache, key, fn, db_obj, cacheDuration = 0, forceNoCache
	}:{
		cache: cacheNames, key: string, db_obj: any} & getCachedObjectParams<T>
	) => {
		const cachedDb = this._cache.get(cache)!
		if (cachedDb.has(key) && cachedDb.get(key)!.age < Date.now() - cacheDuration && !forceNoCache)
			return cachedDb.get(key)!

		cachedDb.delete(key);
		const obj = await fn(key, db_obj)
		const cachedObj = { age: Date.now(), obj: obj as T }
		cachedDb.set(key, cachedObj)

		return cachedObj
	}

}

export const DB_HANDLER = new DataHandler()

