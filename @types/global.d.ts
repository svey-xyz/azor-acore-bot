import type databaseHandler from "../src/database/databaseHandler";
import { _CharacterInfo } from "./acoreObjects";

declare global {
	var __BOT_DATA__: databaseHandler;
}

export { }