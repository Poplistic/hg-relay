import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import {
	Client,
	GatewayIntentBits,
	Events,
	REST,
	Routes
} from "discord.js";

/* ======================
   PATH FIX (ESM)
====================== */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ======================
   ENV
====================== */

const {
	SECRET,
	DISCORD_TOKEN,
	CLIENT_ID,
	GUILD_ID,
	PORT = 10000
} = process.env;

if (!SECRET) throw new Error("SECRET missing");
if (!DISCORD_TOKEN) throw new Error("DISCORD_TOKEN missing");
if (!CLIENT_ID) throw new Error("CLIENT_ID missing");

/* ======================
   EXPRESS
====================== */

const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

/* ======================
   LIVE STATE
====================== */

let liveMapState = [];
let lightingState = {
	clockTime: 12,
	brightness: 2,
	fogColor: [5, 9, 20],
	fogDensity: 0.00035
};

/* ======================
   MAP ENDPOINTS
====================== */

app.post("/map", (req, res) => {
	if (req.body.secret !== SECRET) return res.sendStatus(403);

	liveMapState = Array.isArray(req.body.players)
		? req.body.players
		: [];

	res.sendStatus(200);
});

app.get("/map", (req, res) => {
	res.json(liveMapState);
});

/* ======================
   LIGHTING ENDPOINTS
====================== */

app.post("/lighting", (req, res) => {
	if (req.body.secret !== SECRET) return res.sendStatus(403);

	if (req.body.lighting) {
		lightingState = {
			...lightingState,
			...req.body.lighting
		};
	}

	res.sendStatus(200);
});

app.get("/lighting", (req, res) => {
	res.json(lightingState);
});

/* ======================
   DISCORD BOT
====================== */

const client = new Client({
	intents: [GatewayIntentBits.Guilds]
});

const commands = [
	{
		name: "map",
		description: "View live arena map"
	}
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

client.once(Events.ClientReady, async bot => {
	console.log(`🤖 Logged in as ${bot.user.tag}`);
	await registerCommands();
});

client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isChatInputCommand()) return;

	if (interaction.commandName === "map") {
		await interaction.reply({
			embeds: [{
				title: "🗺️ Live Arena Map",
				description: "[Open 3D Map](https://hg-relay.onrender.com/map.html)",
				color: 0x00b3ff
			}]
		});
	}
});

/* ======================
   START
====================== */

await client.login(DISCORD_TOKEN);

app.listen(PORT, () => {
	console.log(`🚀 HG Relay running on port ${PORT}`);
});
