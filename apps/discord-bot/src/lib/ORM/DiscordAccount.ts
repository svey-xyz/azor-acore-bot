import { ORMObject } from "@azor/lib/ORM/ORMObject";
import { User } from "discord.js";


export class DiscordAccount extends ORMObject<{}> {
	private _userId: string = '';
	private _name: string = '';
	private _lastGift?: number; // Timestamp of the last time the character was updated

	constructor({ key, db_obj }: { key: string, db_obj: User}) {
		super({ key, db_obj });
		this.update(key, db_obj)
	}

	public static override async create(key: string, db_obj?: User) {
		if (!db_obj) return Promise.reject(new Error(`Discord account must have an object passed to be created.`))
		return new DiscordAccount({ key, db_obj });
		}

	public async update(key: string, db_obj: User) {
		this._userId = db_obj.id
		this._name = db_obj.displayName

		super.update(key, db_obj);
		return this;

	}

	public set lastGift(time: number | undefined) { this._lastGift = time; }

	public get userId(): string { return this._userId }
	public get name(): string { return this._name }
	public get lastGift(): number | undefined { return this._lastGift; }

}