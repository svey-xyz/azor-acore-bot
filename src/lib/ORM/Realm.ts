import { QUERIES } from "@azor.server/queries";
import { DB_HANDLER, getDbClient } from "@azor/lib/db";
import { Character } from "@azor.ORM/Character";

export class Realm  {
	private _onlineCharacters: Array<Character> = [];

	public constructor() {
	}

	private updateOnlineCharacters = async () => {
		const db = getDbClient()

		const onlineCharacters = await db.query[QUERIES.GET_ONLINE_CHARACTERS]({});
		if (!onlineCharacters) {
			this._onlineCharacters = [];
			return this._onlineCharacters;
		}

		const chars = onlineCharacters?.flatMap(async (c) => {
			const DB = DB_HANDLER;
			const character = DB.getCharacter({username: c.name, db_obj: c, forceNoCache: true})
			return character
		})
		this._onlineCharacters = await Promise.all(chars);
		return this._onlineCharacters;
	}

	public get onlineCharacters(): Promise<Array<Character>> {
		return this.updateOnlineCharacters();
	}
}

const _REALM = new Realm();
export const getOnlineCharacters = async (): Promise<Array<Character>> => {
	return _REALM.onlineCharacters;
}

export const getPop = async () => {
	return (await (_REALM.onlineCharacters)).length;
}