import { DATABASE } from "@azor.server/DATABASE";
import { Character } from "@azor/lib/ORM/Character";
import { DiscordAccount } from "@azor/lib/ORM/DiscordAccount";
import { Item } from "@azor/lib/ORM/Item";
import { Realm } from "@azor/lib/ORM/Realm";

let db: DATABASE | undefined;
// Singleton pattern to ensure only one instance of DATABASE is created

export const getDbClient = () => {
	if (!db) db = new DATABASE();
	return db;
}

type cacheNames = 'characters' | 'items' | 'discordAccounts'

type getCachedObjectParams<T> = {
	fn: (key: string) => Promise<T>
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
	private _characters = new Map<string, cachedObject<Character>>()
	private _items = new Map<string, cachedObject<Item>>()
	private _discordAccounts = new Map<string, cachedObject<DiscordAccount>>()

	private _cache = new Map<cacheNames, Map<string, cachedObject<Character | Item | DiscordAccount>>>()

	constructor() {
		this._cache.set('characters', this._characters)
		this._cache.set('items', this._items)
		this._cache.set('discordAccounts', this._discordAccounts)

	}
	public get realm(): Realm { return this._realm; }
	public getCharacter = async ({ username, cacheDuration = 10, forceNoCache }:
		{ username: string } & getCachedObjectParams<Character>): Promise<Character | undefined> => {
			const c = await this.getCachedData<Character>({ cache: 'characters', key: username, fn: Character.createFromKey, cacheDuration, forceNoCache})
			if (c?.obj && typeof c.obj == typeof Character) return c?.obj as Character
			return undefined 
		}

	
	getCachedData = async <T extends Character | Item | DiscordAccount>
	({
		cache, key, fn, cacheDuration = 0, forceNoCache
	}:{
		cache: cacheNames, key: string } & getCachedObjectParams<T>
	) => {
		const cachedDb = this._cache.get(cache)!
		if (cachedDb.has(key) && cachedDb.get(key)!.age < Date.now() - cacheDuration && !forceNoCache)
			return cachedDb.get(key)!

		cachedDb.delete(key);
		const obj = await fn(key)
		const cachedObj = { age: Date.now(), obj: obj as T }
		cachedDb.set(key, cachedObj)

		return cachedObj
	}

}
