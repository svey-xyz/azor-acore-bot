import { capitalize } from "../lib/stringFunctions";

export const enum DATABASES {
	CHARACTERS = "acore_characters",
	AUTH = "acore_auth",
	WORLD = "acore_world",
}

export const enum QUERIES {
	GET_CHARACTER_BY_NAME,
	GET_ONLINE_CHARACTERS
}

export const databaseMap = {
	[QUERIES.GET_CHARACTER_BY_NAME]: DATABASES.CHARACTERS,
	[QUERIES.GET_ONLINE_CHARACTERS]: DATABASES.CHARACTERS,
} as const

export type queryArgType = {
	[QUERIES.GET_CHARACTER_BY_NAME]: {
		username: string,
	},
	[QUERIES.GET_ONLINE_CHARACTERS]: {
		// No arguments needed for this query
	},
}

export type expectedQueryReturnType = {
	[QUERIES.GET_CHARACTER_BY_NAME]: _character | null,
	[QUERIES.GET_ONLINE_CHARACTERS]: _character[],
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

		default:
			throw new Error(`Query ${_Q} is not implemented.`);
	}
}