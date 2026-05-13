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
	private _realm
	private _defaultCacheDuration: number = 1000 * 60 * 1; // 1min default cache
	private _characters = new Map<string, cachedObject<Character>>()
	private _items = new Map<string, cachedObject<Item>>()
	private _discordAccounts = new Map<string, cachedObject<DiscordAccount>>()

	private _cache = new Map<cacheNames, Map<string, cachedObject<ORMObject<{}>>>>()

	constructor() {
		this._realm = new Realm();
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
		const c = await this.getCachedData<Character>({ cache: 'characters', key: username, fn: Character.create, db_obj, cacheDuration, forceNoCache})
		if (c?.obj ) return c?.obj as Character
			// && typeof c.obj == typeof Character
		return Promise.reject(new Error(`Error fetching character ${username}`))
	}

	public getItem = async ({
		entry, db_obj, cacheDuration = this._defaultCacheDuration, forceNoCache = false
	} : {
		entry: number, db_obj?: {}, cacheDuration?: number, forceNoCache?: boolean
	}): Promise<Item> => {
		const i = await this.getCachedData<Item>({ cache: 'items', key: String(entry), fn: Item.create, db_obj, cacheDuration, forceNoCache })
		if (i?.obj ) return i?.obj as Item
			// && typeof i.obj == typeof Item
		return Promise.reject(new Error(`Error fetching item with entry ${entry}`))
	}

	public getDiscordAccount = async ({
		id, db_obj, cacheDuration = this._defaultCacheDuration, forceNoCache = false
	} : {
		id: string, db_obj?: {}, cacheDuration?: number, forceNoCache?: boolean
	}): Promise<DiscordAccount> => {
		const da = await this.getCachedData<DiscordAccount>({ cache: 'discordAccounts', key: id, fn: DiscordAccount.create, db_obj, cacheDuration, forceNoCache })

		if (da?.obj) return da?.obj as DiscordAccount
		return Promise.reject(new Error(`Error fetching Discord account with id ${id}`))
	}

	public getRealm(): Realm {
		return this._realm;
	}

	getCachedData = async <T extends ORMObject<{}>>
	({
		cache, key, fn, db_obj, cacheDuration = 0, forceNoCache
	}:{
		cache: cacheNames, key: string, db_obj: any} & getCachedObjectParams<T>
	) => {

		const cachedDb = this._cache.get(cache)!
		const remainingCache = cachedDb.get(key)?.age ? (cacheDuration + cachedDb.get(key)!.age) - Date.now() : undefined

		if (!cachedDb.has(key)) {
			const obj = await fn(key, db_obj)
			const cachedObj = { age: Date.now(), obj: obj as T }
			cachedDb.set(key, cachedObj)
		}

		if ((remainingCache && remainingCache > 0) && !forceNoCache) return cachedDb.get(key)!
		
		const obj = cachedDb.get(key)!.obj
		const updatedObj = await obj.update(key, db_obj);

		const cachedObj = { age: Date.now(), obj: updatedObj as T }
		cachedDb.set(key, cachedObj)

		return cachedObj
	}

}


let _DB_HANDLER: DataHandler | undefined;
// Singleton pattern to ensure only one instance of DATABASE is created

const getDbHandler = () => {
	if (!_DB_HANDLER) _DB_HANDLER = new DataHandler();
	return _DB_HANDLER;
}


export const DB_HANDLER = getDbHandler()

