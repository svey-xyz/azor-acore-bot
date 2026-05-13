import { getDbClient } from "@azor/lib/db";
import { ORMObject } from "@azor/lib/ORM/ORMObject";
import { QUERIES } from "server/queries";

export class Item extends ORMObject<_item> {
	private _name: string = '';
	private _entry: number = 0;
	private _buyPrice?: number;
	private _sellPrice?: number;
	private _description?: string;

	private constructor({ key, db_obj }: { key: string, db_obj:_item}) {
		super({ key, db_obj })
		this.update(key, db_obj);	
	}

	public static override async create(key: string, db_obj?: _item) {
		if (db_obj) return new Item({ key, db_obj });

		const db = getDbClient()

		const databaseItems = await db.query[QUERIES.GET_ITEM_BY_ENTRY]({ entry: parseInt(key) });
		if (!databaseItems || !databaseItems[0]) throw new Error(`Error fetching item with entry: ${key}.`);

		return new Item({ key, db_obj: databaseItems[0] });
	}

	public async update(key: string, db_obj?: _item) {
		let db_obj_to_use = db_obj;

		if (!db_obj_to_use) {
			const db = getDbClient();
			db_obj_to_use = (await db.query[QUERIES.GET_ITEM_BY_ENTRY]({ entry: parseInt(key) }))[0];
		}

		const DB_OBJ = db_obj_to_use as _item;
		if (!DB_OBJ) throw new Error(`Error fetching character with name: ${key}.`);

		this._name = DB_OBJ.name;
		this._entry = DB_OBJ.entry;
		this._buyPrice = DB_OBJ.BuyPrice;
		this._sellPrice = DB_OBJ.SellPrice;
		this._description = DB_OBJ.description;

		super.update(key, DB_OBJ);
		return this;

	}

	public get name(): string { return this._name; }
	public get entry(): number { return this._entry; }
	public get buyPrice(): number | undefined { return this._buyPrice; }
	public get sellPrice(): number | undefined { return this._sellPrice;}
	public get description(): string | undefined { return this._description; }
}
