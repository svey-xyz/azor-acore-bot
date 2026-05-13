type emptyDbObject = {}

export class ORMObject<dbT> {
	private _key;
	private _db_obj;

	constructor({ key, db_obj }: { key: string, db_obj: dbT }) {
		this._key = key;
		this._db_obj = db_obj;
	}

	protected static async create(key: string, db_obj?: any): Promise<ORMObject<emptyDbObject>> {
		return new ORMObject<emptyDbObject>({ key, db_obj: db_obj })
	}

	public async update(key: string, db_obj?: any) {
		if (db_obj) this._db_obj = db_obj;
		return this
	}

	public get key(): string { return this._key; }
	public get db_obj(): dbT { return this._db_obj; }
}