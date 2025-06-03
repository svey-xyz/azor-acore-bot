export const enum QUERIES {
	GET_CHARACTER_BY_NAME,
}

export const databaseMap = {
	[QUERIES.GET_CHARACTER_BY_NAME]: "acore_characters",
} as const;

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
		const sanitizedUsername = args.username.replace(/'/g, "''"); // Escape single quotes
		return `SELECT * FROM characters WHERE name = '${sanitizedUsername}' LIMIT 1;`;
	},

}