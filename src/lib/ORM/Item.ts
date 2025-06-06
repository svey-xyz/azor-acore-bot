import { getDbClient } from "@azor/lib/db";
import { QUERIES } from "server/queries";

const db = getDbClient()

type _c = {
	age: number,
	item: Item
}

const items = new Map<number, _c>();

export const getItemByEntry = async (entry: number, forceNoCache: boolean = false) => {

	try {
		if (!items.has(entry)) return await updateCachedItem(entry);
		const char = await addCachedItem(items.get(entry)!.item, forceNoCache);
		return char
	} catch (error) {
		return Promise.reject(new Error(`Error fetching item by entry: ${entry}`));
	}

}

const addCachedItem = async (item: Item, forceNoCache: boolean = false): Promise<Item> => {
	const entry = item.entry;
	const name = item.name;
	const _t = items.get(item.entry)!;
	if (!_t) throw new Error(`Item not found in cache: ${name}`);

	let cacheDuration = 1000 * 60 * 5; // 5 minute default cache duration
	if (forceNoCache) cacheDuration = 0; // Force no cache
	// If the item is still within the cache duration, return it
	if (_t.age > Date.now() - cacheDuration) return _t.item
	else items.delete(entry); // Remove the item from cache if it has expired

	// Otherwise, fetch the character again
	return await updateCachedItem(entry);
}

const updateCachedItem = async (entry: number): Promise<Item> => {
	const item = await Item.createItem(entry);
	items.set(entry, { age: Date.now(), item: item });
	return item;
}

export class Item {
	private _name: string;
	private _entry: number;
	private _buyPrice?: number;
	private _sellPrice?: number;
	private _description?: string;
	private _databaseItem: _item;

	private constructor({ db_item }: { db_item:_item}) {
		this._databaseItem = db_item;

		// Assign properties from the database item
		this._name = db_item.name;
		this._entry = db_item.entry;
		this._buyPrice = db_item.BuyPrice;
		this._sellPrice = db_item.SellPrice;
		this._description = db_item.description;

	}

	public static createItemFromDb = (db_item: _item) => {
		return new Item({ db_item });
	}

	public static createItem = async (entry: number) => {
		const databaseItems = await db.query[QUERIES.GET_ITEM_BY_ENTRY]({ entry });
		if (!databaseItems || !databaseItems[0]) throw new Error(`Error fetching item with entry: ${entry}.`);

		return new Item({ db_item: databaseItems[0] });
	}

	public get name(): string { return this._name; }
	public get entry(): number { return this._entry; }
	public get buyPrice(): number | undefined { return this._buyPrice; }
	public get sellPrice(): number | undefined { return this._sellPrice;}
	public get description(): string | undefined { return this._description; }

	public get databaseItem(): _item { return this._databaseItem; }
}
