import express from "express";
import fs from "fs";
import path from "path";
import {
	Client,
	GatewayIntentBits,
	Events,
	REST,
	Routes
} from "discord.js";

const app = express();
app.use(express.json());
app.use(express.static("public"));

const {
	SECRET,
	DISCORD_TOKEN,
	CLIENT_ID,
	GUILD_ID,
	PORT = 10000
} = process.env;

/* ======================
   LIVE MAP STATE
====================== */

let liveMapState = [];

app.post("/map", (req, res) => {
	if (req.body.secret !== SECRET) return res.sendStatus(403);
	liveMapState = req.body.players || [];
	res.sendStatus(200);
});

app.get("/map", (req, res) => {
	res.json(liveMapState);
});

/* ======================
   DISCORD BOT
====================== */

const client = new Client({
	intents: [GatewayIntentBits.Guilds]
});

const commands = [
	{ name: "map", description: "View live arena map" }
];

async function registerCommands() {
	const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);

	await rest.put(
		GUILD_ID
			? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
			: Routes.applicationCommands(CLIENT_ID),
		{ body: commands }
	);
}

client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isChatInputCommand()) return;

	if (interaction.commandName === "map") {
		await interaction.reply({
			embeds: [{
				title: "🗺️ Live Arena Map",
				description: "[Open 3D Map](https://hg-relay.onrender.com/map.html)",
				color: 0xff0000
			}]
		});
	}
});

client.once(Events.ClientReady, async bot => {
	console.log(`🤖 Logged in as ${bot.user.tag}`);
	await registerCommands();
});

await client.login(DISCORD_TOKEN);

/* ======================
   START SERVER
====================== */

app.listen(PORT, () => {
	console.log(`🚀 HG Relay running on port ${PORT}`);
});
