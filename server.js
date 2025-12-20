import express from "express";
import fs from "fs";
import {
	Client,
	GatewayIntentBits,
	EmbedBuilder,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	Events,
	REST,
	Routes
} from "discord.js";

/* ======================
   BASIC SETUP
====================== */

const app = express();
app.use(express.json());

const {
	SECRET,
	DISCORD_TOKEN,
	CLIENT_ID,
	GUILD_ID,
	CHANNEL_ID,
	PORT = 10000
} = process.env;

const QUEUE_FILE = "./queue.json";

/* ======================
   QUEUE HELPERS
====================== */

function loadQueue() {
	if (!fs.existsSync(QUEUE_FILE)) return [];
	return JSON.parse(fs.readFileSync(QUEUE_FILE, "utf8"));
}

function saveQueue(queue) {
	fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
}

function enqueue(command, args = []) {
	const queue = loadQueue();
	queue.push({ command, args });
	saveQueue(queue);
}

/* ======================
   DISCORD CLIENT
====================== */

const client = new Client({
	intents: [GatewayIntentBits.Guilds]
});

/* ======================
   SLASH COMMANDS
====================== */

const commands = [
	{ name: "day", description: "Start daytime" },
	{ name: "night", description: "Start nighttime" },
	{ name: "finale", description: "Start finale" },
	{
		name: "year",
		description: "Set Hunger Games year",
		options: [
			{
				name: "number",
				description: "Year 1–100",
				type: 4,
				required: true
			}
		]
	},
	{ name: "sponsor", description: "Trigger sponsor event" },
	{
		name: "storm",
		description: "Control storm weather",
		options: [
			{
				name: "state",
				description: "Start or stop the storm",
				type: 3,
				required: true,
				choices: [
					{ name: "start", value: "START" },
					{ name: "stop", value: "STOP" }
				]
			}
		]
	}
];

async function registerCommands() {
	const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);

	if (GUILD_ID) {
		await rest.put(
			Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
			{ body: commands }
		);
	} else {
		await rest.put(
			Routes.applicationCommands(CLIENT_ID),
			{ body: commands }
		);
	}
}

/* ======================
   LIVE STATE + VOTES
====================== */

let latestState = [];
let sponsorVotes = {};
let oddsMessageId = null;
let voteMessageId = null;

/* ======================
   ROBLOX ROUTES
====================== */

app.get("/poll", (req, res) => {
	if (req.query.secret !== SECRET) return res.sendStatus(403);

	const queue = loadQueue();
	saveQueue([]);
	res.json(queue);
});

app.post("/state", (req, res) => {
	if (req.body.secret !== SECRET) return res.sendStatus(403);

	latestState = req.body.state || [];

	for (const t of latestState) {
		if (!sponsorVotes[t.name]) {
			sponsorVotes[t.name] = t.votes || 0;
		}
	}

	res.sendStatus(200);
});

/* ======================
   INTERACTIONS
====================== */

client.on(Events.InteractionCreate, async interaction => {
	if (interaction.isChatInputCommand()) {
		switch (interaction.commandName) {
			case "day":
				enqueue("DAY");
				await interaction.reply("🌞 Day started.");
				break;

			case "night":
				enqueue("NIGHT");
				await interaction.reply("🌙 Night started.");
				break;

			case "finale":
				enqueue("FINALE");
				await interaction.reply("🔥 Finale started.");
				break;

			case "year": {
				const year = interaction.options.getInteger("number");
				enqueue("YEAR", [year]);
				await interaction.reply(`📅 Year set to ${year}`);
				break;
			}

			case "sponsor":
				enqueue("SPONSOR");
				await interaction.reply("🎁 Sponsor triggered.");
				break;

			case "storm": {
				const state = interaction.options.getString("state");
				enqueue("STORM", [state]);
				await interaction.reply(
					state === "START"
						? "🌩️ Storm started."
						: "☀️ Storm stopped."
				);
				break;
			}
		}
	}
});

/* ======================
   READY
====================== */

client.once(Events.ClientReady, async bot => {
	console.log(`🤖 Logged in as ${bot.user.tag}`);
	await registerCommands();
});

/* ======================
   START
====================== */

app.listen(PORT, () => {
	console.log(`🚀 HG Relay running on port ${PORT}`);
});

await client.login(DISCORD_TOKEN);
