type emptyDbObject = {}

export class ORMObject<dbT> {
	private _key;
	private _db_obj;

	constructor({ key, db_obj }: { key: string, db_obj: dbT }) {
		this._key = key;
		this._db_obj = db_obj;
	}

	public static createFromKey = async (key: string): Promise<ORMObject<emptyDbObject>> => {
		return new ORMObject<emptyDbObject>({ key, db_obj: {} })
	}

	public get key(): string { return this._key; }
	public get db_obj(): dbT { return this._db_obj; }
}