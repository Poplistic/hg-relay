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
	PORT = 3000
} = process.env;

const QUEUE_FILE = "./queue.json";

/* ======================
   DISCORD CLIENT
====================== */

const client = new Client({
	intents: [GatewayIntentBits.Guilds]
});

/* ======================
   COMMAND REGISTRATION
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
	{ name: "sponsor", description: "Trigger sponsor event" }
];

async function registerCommands() {
	const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);

	try {
		if (GUILD_ID) {
			console.log("📌 Registering GUILD commands");
			await rest.put(
				Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
				{ body: commands }
			);
		} else {
			console.log("🌍 Registering GLOBAL commands");
			await rest.put(
				Routes.applicationCommands(CLIENT_ID),
				{ body: commands }
			);
		}
	} catch (err) {
		console.error("❌ Command registration failed:", err);
	}
}

/* ======================
   COMMAND QUEUE
====================== */

function loadQueue() {
	if (!fs.existsSync(QUEUE_FILE)) return [];
	return JSON.parse(fs.readFileSync(QUEUE_FILE, "utf8"));
}

function saveQueue(queue) {
	fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
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
		if (!sponsorVotes[t.name]) sponsorVotes[t.name] = t.votes || 0;
	}

	res.sendStatus(200);
});

/* ======================
   DISCORD BUTTON VOTING
====================== */

client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isButton()) return;

	const name = interaction.customId.replace("vote_", "");
	sponsorVotes[name] = (sponsorVotes[name] || 0) + 1;

	await interaction.reply({
		content: `🎁 You sponsored **${name}**!`,
		ephemeral: true
	});
});

/* ======================
   READY + LIVE EMBEDS
====================== */

client.once(Events.ClientReady, async bot => {
	console.log(`🤖 Logged in as ${bot.user.tag}`);

	await registerCommands();

	const channel = await bot.channels.fetch(CHANNEL_ID);

	setInterval(async () => {
		if (!latestState.length) return;

		const scored = latestState.map(t => {
			const votes = sponsorVotes[t.name] || 0;
			const score = t.kills * 2 + votes;
			return { ...t, votes, score };
		});

		const maxScore = Math.max(...scored.map(t => t.score), 1);

		scored.forEach(t => {
			t.odds = Math.round((t.score / maxScore) * 100);
		});

		/* ---- ODDS EMBED ---- */

		const oddsEmbed = new EmbedBuilder()
			.setTitle("🎲 Live Victory Odds")
			.setColor(0x9b59b6)
			.setDescription(
				scored
					.sort((a, b) => b.odds - a.odds)
					.map(
						t =>
							`**${t.name}** — ${t.odds}% 🗡️ ${t.kills} 🎁 ${t.votes}`
					)
					.join("\n")
			)
			.setTimestamp();

		if (!oddsMessageId) {
			const msg = await channel.send({ embeds: [oddsEmbed] });
			oddsMessageId = msg.id;
		} else {
			const msg = await channel.messages.fetch(oddsMessageId);
			await msg.edit({ embeds: [oddsEmbed] });
		}

		/* ---- VOTING EMBED ---- */

		const buttons = scored
			.filter(t => t.alive)
			.slice(0, 5)
			.map(t =>
				new ButtonBuilder()
					.setCustomId(`vote_${t.name}`)
					.setLabel(t.name)
					.setStyle(ButtonStyle.Primary)
			);

		const row = new ActionRowBuilder().addComponents(buttons);

		const voteEmbed = new EmbedBuilder()
			.setTitle("🎁 Sponsor a Tribute")
			.setDescription("Click a button to send sponsor support!")
			.setColor(0xf1c40f);

		if (!voteMessageId) {
			const msg = await channel.send({
				embeds: [voteEmbed],
				components: [row]
			});
			voteMessageId = msg.id;
		} else {
			const msg = await channel.messages.fetch(voteMessageId);
			await msg.edit({
				embeds: [voteEmbed],
				components: [row]
			});
		}
	}, 10000);
});

/* ======================
   START SERVER
====================== */

app.listen(PORT, () => {
	console.log(`🚀 HG Relay running on port ${PORT}`);
});

await client.login(DISCORD_TOKEN);
