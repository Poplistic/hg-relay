import express from "express";
import fs from "fs";
import {
	Client,
	GatewayIntentBits,
	EmbedBuilder,
	REST,
	Routes,
	SlashCommandBuilder
} from "discord.js";

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

await client.login(process.env.DISCORD_TOKEN);

client.once("ready", async () => {
	console.log(`🤖 Logged in as ${client.user.tag}`);
	await registerCommands();
});

/* ======================
   SLASH COMMAND REGISTRATION
====================== */

async function registerCommands() {
	const commands = [
		new SlashCommandBuilder().setName("day").setDescription("Start daytime"),
		new SlashCommandBuilder().setName("night").setDescription("Start nighttime"),
		new SlashCommandBuilder().setName("finale").setDescription("Start finale"),
		new SlashCommandBuilder()
			.setName("year")
			.setDescription("Set Hunger Games year")
			.addIntegerOption(opt =>
				opt.setName("number").setDescription("Year 1–100").setRequired(true)
			),
		new SlashCommandBuilder()
			.setName("sponsor")
			.setDescription("Trigger sponsor event")
	].map(c => c.toJSON());

	const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

	await rest.put(
		Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),
		{ body: commands }
	);

	console.log("✅ Slash commands registered");
}

/* ======================
   COMMAND QUEUE
====================== */

function loadQueue() {
	if (!fs.existsSync(QUEUE_FILE)) return [];
	return JSON.parse(fs.readFileSync(QUEUE_FILE));
}

function saveQueue(queue) {
	fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
}

function enqueue(command, args = []) {
	const queue = loadQueue();
	queue.push({ command, args, time: Date.now() });
	saveQueue(queue);
}

/* ======================
   DISCORD COMMAND HANDLER
====================== */

client.on("interactionCreate", async interaction => {
	if (!interaction.isChatInputCommand()) return;

	// Optional permission check
	if (process.env.ADMIN_ROLE_ID) {
		const member = interaction.member;
		if (!member.roles.cache.has(process.env.ADMIN_ROLE_ID)) {
			return interaction.reply({
				content: "❌ You are not allowed to run this command.",
				ephemeral: true
			});
		}
	}

	switch (interaction.commandName) {
		case "day":
			enqueue("DAY");
			await interaction.reply("☀️ Day has begun.");
			break;

		case "night":
			enqueue("NIGHT");
			await interaction.reply("🌙 Night has fallen.");
			break;

		case "finale":
			enqueue("FINALE");
			await interaction.reply("🔥 Finale initiated.");
			break;

		case "year": {
			const year = interaction.options.getInteger("number");
			if (year < 1 || year > 100) {
				return interaction.reply({
					content: "❌ Year must be between 1 and 100.",
					ephemeral: true
				});
			}
			enqueue("YEAR", [year]);
			await interaction.reply(`📜 Hunger Games Year set to ${year}.`);
			break;
		}

		case "sponsor":
			enqueue("SPONSOR");
			await interaction.reply("🎁 Sponsor event triggered.");
			break;
	}
});

/* ======================
   ROBLOX ROUTES
====================== */

app.get("/poll", (req, res) => {
	if (req.query.secret !== SECRET) return res.sendStatus(403);

	const queue = loadQueue();
	saveQueue([]);
	res.json(queue);
});

/* ======================
   START SERVER
====================== */

app.listen(PORT, () => {
	console.log(`🚀 HG Relay running on port ${PORT}`);
});
