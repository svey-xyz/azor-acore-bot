import { capitalize } from "@azor.lib/stringFunctions";

export const enum DATABASES {
	CHARACTERS = "acore_characters",
	AUTH = "acore_auth",
	WORLD = "acore_world",
}

export const enum QUERIES {
	GET_CHARACTER_BY_NAME,
	GET_ONLINE_CHARACTERS,
	GET_ITEM_BY_ENTRY
}

export const databaseMap = {
	[QUERIES.GET_CHARACTER_BY_NAME]: DATABASES.CHARACTERS,
	[QUERIES.GET_ONLINE_CHARACTERS]: DATABASES.CHARACTERS,
	[QUERIES.GET_ITEM_BY_ENTRY]: DATABASES.WORLD,
} as const

export type queryArgType = {
	[QUERIES.GET_CHARACTER_BY_NAME]: {
		username: string,
	},
	[QUERIES.GET_ONLINE_CHARACTERS]: {
		// No arguments needed for this query
	},
	[QUERIES.GET_ITEM_BY_ENTRY]: {
		entry: number,
	},
}

export type expectedQueryReturnType = {
	[QUERIES.GET_CHARACTER_BY_NAME]: _character[] | null,
	[QUERIES.GET_ONLINE_CHARACTERS]: _character[],
	[QUERIES.GET_ITEM_BY_ENTRY]: _item[] | null,
}

export const queries = ({ _Q, args }: {_Q: QUERIES, args: queryArgType[typeof _Q]}) => {
	
	switch (_Q) {
		case QUERIES.GET_CHARACTER_BY_NAME:
			const gcbnArgs = args as queryArgType[QUERIES.GET_CHARACTER_BY_NAME];
			if (!gcbnArgs.username || !(typeof gcbnArgs.username == 'string'))
				throw new Error(`Username as a string is a required argument for ${QUERIES.GET_CHARACTER_BY_NAME}.`);
				
			const sanitizedUsername = capitalize(gcbnArgs.username.replace(/'/g, "''").toLowerCase());
			return `SELECT * FROM characters WHERE name = '${sanitizedUsername}' LIMIT 1;`;

		case QUERIES.GET_ONLINE_CHARACTERS:
			const gocArgs = args as queryArgType[QUERIES.GET_ONLINE_CHARACTERS];
			if (Object.keys(gocArgs).length !== 0)
				throw new Error(`No arguments expected for ${QUERIES.GET_ONLINE_CHARACTERS}.`);

			return `SELECT * FROM characters WHERE online = 1;`;

		case QUERIES.GET_ITEM_BY_ENTRY:
			const gibeArgs = args as queryArgType[QUERIES.GET_ITEM_BY_ENTRY];
			if (!gibeArgs.entry || typeof gibeArgs.entry !== 'number')
				throw new Error(`Entry as a number is a required argument for ${QUERIES.GET_ITEM_BY_ENTRY}.`);
			return `SELECT * FROM item_template WHERE entry = ${gibeArgs.entry} LIMIT 1;`;

		// Add more cases for other queries as needed
		// You can also throw an error for unimplemented queries
		// or return a default query if needed.
		default:
			throw new Error(`Query ${_Q} is not implemented.`);
	}
}