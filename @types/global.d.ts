import { Client, Collection } from "discord.js";
declare module 'discord.js' {
	interface Client<boolean> {
		commands: Collection<K, V>;
	}
}