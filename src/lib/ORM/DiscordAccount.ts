import { ORMObject } from "@azor/lib/ORM/ORMObject";


export class DiscordAccount extends ORMObject<{}> {
	// private _userId: number;
	// private _name: string;

	constructor({ key, db_obj }: { key: string, db_obj: {}}) {
		super({ key, db_obj });
	}

	// public get userId(): number { return this._userId }
	// public get name(): string { return this.name }

}