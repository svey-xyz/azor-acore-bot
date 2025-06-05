import { DATABASE } from "@azor.server/DATABASE";

let db: DATABASE | undefined;
// Singleton pattern to ensure only one instance of DATABASE is created

export const getDbClient = () => {
	if (!db) db = new DATABASE();
	return db;
}