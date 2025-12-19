import express from "express";
import fs from "fs";

const app = express();
app.use(express.json());

const SECRET = process.env.SECRET;
const QUEUE_FILE = "./queue.json";

function loadQueue() {
  if (!fs.existsSync(QUEUE_FILE)) return [];
  return JSON.parse(fs.readFileSync(QUEUE_FILE));
}

function saveQueue(queue) {
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue));
}

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
  saveQueue([]); // clear after read
  res.json(queue);
});

import { EmbedBuilder } from "discord.js";

app.post("/recap", async (req, res) => {
	if (req.body.secret !== SECRET) return res.sendStatus(403);

	const { year, results } = req.body;
	const channel = await client.channels.fetch(process.env.RECAP_CHANNEL);

	// Sort by placement (1st → last)
	results.sort((a, b) => a.Placement - b.Placement);

	const description = results.map(r => {
		return `**${r.PlacementText} — ${r.Name}**
🗡️ Kills: ${r.Kills}
🎁 Sponsors: ${r.Sponsors}`;
	}).join("\n\n");

	const embed = new EmbedBuilder()
		.setTitle(`🏆 Hunger Games ${year}`)
		.setDescription(description)
		.setColor(0xC0392B)
		.setFooter({ text: "Panem Today • Official Recap" })
		.setTimestamp();

	await channel.send({ embeds: [embed] });
	res.sendStatus(200);
});

app.listen(process.env.PORT || 3000);

