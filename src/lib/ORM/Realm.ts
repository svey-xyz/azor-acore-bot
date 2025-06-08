import { QUERIES } from "@azor.server/queries";
import { DB_HANDLER, getDbClient } from "@azor/lib/db";
import { Character } from "@azor.ORM/Character";

export class Realm  {
	private _onlineCharacters: Array<Character> = [];
	private _pop: number = 0;

	public constructor() {
		this.updateOnlineCharacters().then((characters) => {
			this._onlineCharacters = characters;
			this._pop = characters.length;
		}).catch((err) => {
			console.error("Error updating online characters:", err);
			this._onlineCharacters = [];
			this._pop = 0;
		});
		// return this
	}

	private async updateOnlineCharacters() {
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

	private async updatePop() {
		const onlineCharacters = await this.updateOnlineCharacters();
		this._pop = onlineCharacters.length;
		return this._pop;
	}

	public get onlineCharacters(): Promise<Array<Character>> {
		return this.updateOnlineCharacters();

	}

	public get pop(): Promise<number> {
		return this.updatePop();
	}
}