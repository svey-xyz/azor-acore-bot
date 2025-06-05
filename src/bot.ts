import { Client, Intents } from "discord.js";
import { ready } from "@azor/listeners/ready";
import { interactionCreate } from "@azor/listeners/interactionCreate";
import { DISCORD_TOKEN } from "@azor.lib/conf.env";

const token: string = DISCORD_TOKEN;

const client = new Client({
	intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_EMOJIS_AND_STICKERS, Intents.FLAGS.GUILD_MEMBERS, Intents.FLAGS.GUILD_MESSAGE_REACTIONS, Intents.FLAGS.GUILD_PRESENCES],
	partials: ["MESSAGE", "CHANNEL", "REACTION"]
});

ready(client);
interactionCreate(client);

client.login(token)

// const test = async () => {
// 	const db = new DATABASE();
// 	// db.getConnection('acore_auth')
// 	const query = await db.query(QUERIES.GET_CHARACTER_BY_NAME, { username: 'Svey' });
// 	console.log(query);
// }


// test();
// https://discord.com/api/oauth2/authorize?client_id=1379255087171375154&permissions=581085722147905&scope=bot%20applications.commands

// perms = 581085722147905
// id = 1379255087171375154