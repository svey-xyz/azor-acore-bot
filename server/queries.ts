import { capitalize } from "../lib/stringFunctions";

export const enum DATABASES {
	CHARACTERS = "acore_characters",
	AUTH = "acore_auth",
	WORLD = "acore_world",
}

export const enum QUERIES {
	GET_CHARACTER_BY_NAME,
}

export const databaseMap = {
	[QUERIES.GET_CHARACTER_BY_NAME]: DATABASES.CHARACTERS,
} as const

export type queryArgs = {
	[QUERIES.GET_CHARACTER_BY_NAME]: {
		username: string,
	},
}

export type expectedQueryReturnType = {
	[QUERIES.GET_CHARACTER_BY_NAME]: _character | null
}

export const queries = {
	[QUERIES.GET_CHARACTER_BY_NAME]: ({ args }: { args: queryArgs[QUERIES.GET_CHARACTER_BY_NAME]}): string => {
		if (!args || !args.username || typeof args.username !== 'string') {
			throw new Error("Invalid username provided.");	
		}
		
		// Escape single quotes, convert to lowercase, and capitalize the first letter for consistency with database entries
		const sanitizedUsername = capitalize(args.username.replace(/'/g, "''").toLowerCase()); 
		return `SELECT * FROM characters WHERE name = '${sanitizedUsername}' LIMIT 1;`;
	},
}