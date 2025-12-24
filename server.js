import express from "express";
import fs from "fs";
import {
	Client,
	GatewayIntentBits,
	Events
} from "discord.js";

const app = express();
app.use(express.json());

const {
	SECRET,
	DISCORD_TOKEN,
	PORT = 10000,
	RECAP_CHANNEL_ID
} = process.env;

const STATE_FILE = "./liveState.json";

const client = new Client({
	intents: [GatewayIntentBits.Guilds]
});

/* ======================
   STATE ROUTE
====================== */

app.post("/state", (req, res) => {
	const { secret, state } = req.body;
	if (secret !== SECRET) return res.sendStatus(403);

	fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
	res.sendStatus(200);
});

/* ======================
   ROTATION ARROWS
====================== */

function rotationArrow(deg = 0) {
	const d = ((deg % 360) + 360) % 360;

	if (d >= 337.5 || d < 22.5) return "⬆️";
	if (d < 67.5) return "↗️";
	if (d < 112.5) return "➡️";
	if (d < 157.5) return "↘️";
	if (d < 202.5) return "⬇️";
	if (d < 247.5) return "↙️";
	if (d < 292.5) return "⬅️";
	return "↖️";
}

/* ======================
   MAP RENDER
====================== */

function renderMap(tributes, size = 10) {
	const grid = Array.from({ length: size }, () =>
		Array(size).fill("⬛")
	);

	for (const t of tributes) {
		if (!t.alive || !t.position) continue;

		const x = Math.floor(t.position.x * (size - 1));
		const z = Math.floor(t.position.z * (size - 1));

		grid[z][x] = rotationArrow(t.rotation);
	}

	return grid.map(r => r.join("")).join("\n");
}

/* ======================
   LIVE EMBED UPDATE
====================== */

async function updateLiveEmbed() {
	if (!fs.existsSync(STATE_FILE)) return;

	const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
	const channel = await client.channels.fetch(RECAP_CHANNEL_ID);

	const alive = state.tributes.filter(t => t.alive);
	const dead = state.tributes.filter(t => !t.alive);

	const tributeLines = state.tributes.map(t =>
		`${t.alive ? "🟢" : "🔴"} **D${t.district}** ${t.displayName} (${t.kills}⚔️)`
	);

	const embed = {
		title: `🏹 Hunger Games — ${state.gameState}`,
		description: tributeLines.join("\n").slice(0, 4000),
		fields: [
			{ name: "Alive", value: `${alive.length}`, inline: true },
			{ name: "Dead", value: `${dead.length}`, inline: true },
			{
				name: "Arena Map",
				value: "```\n" + renderMap(state.tributes) + "\n```"
			}
		],
		timestamp: new Date().toISOString()
	};

	const messages = await channel.messages.fetch({ limit: 1 });
	const msg = messages.first();

	if (msg && msg.author.id === client.user.id) {
		await msg.edit({ embeds: [embed] });
	} else {
		await channel.send({ embeds: [embed] });
	}
}

setInterval(updateLiveEmbed, 10_000);

/* ======================
   READY
====================== */

client.once(Events.ClientReady, bot => {
	console.log(`🤖 Logged in as ${bot.user.tag}`);
});

app.listen(PORT, () => {
	console.log(`🚀 HG Relay running on port ${PORT}`);
});

await client.login(DISCORD_TOKEN);
