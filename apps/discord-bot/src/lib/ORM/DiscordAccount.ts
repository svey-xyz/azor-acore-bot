import { ORMObject } from "@azor/lib/ORM/ORMObject";
import { User } from "discord.js";

// Stage 3 (2026-05-13): `lastGift` removed. Gift cooldown is now owned by the
// server module (`mod_azor_api_interactions` audit table); the bot is no
// longer the source of truth. See docs/PLAN.md Stage 3.

export class DiscordAccount extends ORMObject<{}> {
	private _userId: string = '';
	private _name: string = '';

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

	public get userId(): string { return this._userId }
	public get name(): string { return this._name }

}
