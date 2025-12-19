import express from "express";
import fs from "fs";
import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";

/* ======================
   BASIC SERVER SETUP
====================== */

const app = express();
app.use(express.json());

const SECRET = process.env.SECRET;
const PORT = process.env.PORT || 3000;
const QUEUE_FILE = "./queue.json";

/* ======================
   DISCORD CLIENT
====================== */

const client = new Client({
	intents: [GatewayIntentBits.Guilds]
});

client.once("ready", () => {
	console.log(`🤖 Discord bot logged in as ${client.user.tag}`);
});

await client.login(process.env.DISCORD_TOKEN);

/* ======================
   PERSISTENT COMMAND QUEUE
====================== */

function loadQueue() {
	if (!fs.existsSync(QUEUE_FILE)) return [];
	return JSON.parse(fs.readFileSync(QUEUE_FILE));
}

function saveQueue(queue) {
	fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
}

/* ======================
   LIVE STATE + TRACKING
====================== */

let latestState = [];
let previousAlive = new Set();

let liveMessageId = null;
let sponsorMessageId = null;

/* ======================
   ROUTES
====================== */

app.post("/command", (req, res) => {
	if (req.body.secret !== SECRET) return res.sendStatus(403);

	const queue = loadQueue();
	queue.push({
		command: req.body.command,
		args: req.body.args || [],
		time: Date.now()
	});
	saveQueue(queue);

	res.sendStatus(200);
});

app.get("/poll", (req, res) => {
	if (req.query.secret !== SECRET) return res.sendStatus(403);

	const queue = loadQueue();
	saveQueue([]);
	res.json(queue);
});

app.post("/state", (req, res) => {
	if (req.body.secret !== SECRET) return res.sendStatus(403);

	latestState = req.body.state || [];
	res.sendStatus(200);
});

app.post("/recap", async (req, res) => {
	if (req.body.secret !== SECRET) return res.sendStatus(403);

	const { year, results } = req.body;
	const channel = await client.channels.fetch(process.env.RECAP_CHANNEL);

	results.sort((a, b) => a.Placement - b.Placement);

	const description = results.map(r => (
		`**${r.PlacementText} — ${r.Name}**
🗡️ Kills: ${r.Kills}
🎁 Sponsors: ${r.Sponsors}`
	)).join("\n\n");

	const embed = new EmbedBuilder()
		.setTitle(`🏆 Hunger Games ${year}`)
		.setDescription(description)
		.setColor(0xC0392B)
		.setFooter({ text: "Panem Today • Official Recap" })
		.setTimestamp();

	await channel.send({ embeds: [embed] });
	res.sendStatus(200);
});

/* ======================
   DISCORD LIVE LOOP
====================== */

client.once("ready", async () => {
	console.log("📡 Live HG systems online");

	const liveChannel = await client.channels.fetch(process.env.CHANNEL_ID);

	setInterval(async () => {
		if (!latestState.length) return;

		/* ---- DEATH DETECTION ---- */
		const currentAlive = new Set(
			latestState.filter(t => t.alive).map(t => t.name)
		);

		for (const name of previousAlive) {
			if (!currentAlive.has(name)) {
				await liveChannel.send(`⚰️ **${name}** has fallen.`);
			}
		}

		previousAlive = currentAlive;

		/* ---- LIVE STATUS EMBED ---- */
		const alive = latestState.filter(t => t.alive);

		const liveEmbed = new EmbedBuilder()
			.setTitle("🏹 Hunger Games Live")
			.setDescription(`🟢 Alive: ${alive.length}`)
			.setColor(0x2ECC71)
			.addFields(
				alive.map(t => ({
					name: t.name,
					value: `🗡️ ${t.kills}`,
					inline: true
				}))
			)
			.setTimestamp();

		if (!liveMessageId) {
			const msg = await liveChannel.send({ embeds: [liveEmbed] });
			liveMessageId = msg.id;
		} else {
			const msg = await liveChannel.messages.fetch(liveMessageId);
			await msg.edit({ embeds: [liveEmbed] });
		}

		/* ---- SPONSOR VOTE EMBED ---- */
		const sponsorSorted = [...latestState]
			.sort((a, b) => b.votes - a.votes)
			.slice(0, 10);

		const sponsorEmbed = new EmbedBuilder()
			.setTitle("🎁 Sponsor Votes")
			.setColor(0xF1C40F)
			.setDescription(
				sponsorSorted.map((t, i) =>
					`**${i + 1}. ${t.name}** — 🗳️ ${t.votes}`
				).join("\n")
			)
			.setTimestamp();

		if (!sponsorMessageId) {
			const msg = await liveChannel.send({ embeds: [sponsorEmbed] });
			sponsorMessageId = msg.id;
		} else {
			const msg = await liveChannel.messages.fetch(sponsorMessageId);
			await msg.edit({ embeds: [sponsorEmbed] });
		}

	}, 10000);
});

/* ======================
   START SERVER
====================== */

app.listen(PORT, () => {
	console.log(`🚀 HG Relay running on port ${PORT}`);
});
