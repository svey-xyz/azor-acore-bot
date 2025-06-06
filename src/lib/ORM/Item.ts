import { getDbClient } from "@azor/lib/db";
import { ORMObject } from "@azor/lib/ORM/ORMObject";
import { QUERIES } from "server/queries";

export class Item extends ORMObject<_item> {
	private _name: string;
	private _entry: number;
	private _buyPrice?: number;
	private _sellPrice?: number;
	private _description?: string;

	private constructor({ key, db_obj }: { key: string, db_obj:_item}) {
		super({ key, db_obj })

		// Assign properties from the database item
		this._name = db_obj.name;
		this._entry = db_obj.entry;
		this._buyPrice = db_obj.BuyPrice;
		this._sellPrice = db_obj.SellPrice;
		this._description = db_obj.description;

	}

	// public static createItemFromDb = (db_obj: _item) => {
	// 	return new Item({ key: String(db_obj.entry), db_obj });
	// }

	public static override createFromKey = async (key: string, db_obj?: _item) => {
		if (db_obj) return new Item({ key, db_obj });

		const db = getDbClient()

		const databaseItems = await db.query[QUERIES.GET_ITEM_BY_ENTRY]({ entry: parseInt(key) });
		if (!databaseItems || !databaseItems[0]) throw new Error(`Error fetching item with entry: ${key}.`);

		return new Item({ key, db_obj: databaseItems[0] });
	}

	// public static override createFromKey = async (key: string) => {
	// 	const db = getDbClient()
	// 	const entry = parseInt(key)

	// 	const databaseItems = await db.query[QUERIES.GET_ITEM_BY_ENTRY]({ entry });
	// 	if (!databaseItems || !databaseItems[0]) throw new Error(`Error fetching item with entry: ${entry}.`);

	// 	return new Item({ key, db_obj: databaseItems[0] });
	// }

	public get name(): string { return this._name; }
	public get entry(): number { return this._entry; }
	public get buyPrice(): number | undefined { return this._buyPrice; }
	public get sellPrice(): number | undefined { return this._sellPrice;}
	public get description(): string | undefined { return this._description; }
}
