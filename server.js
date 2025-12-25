import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer } from "http";
import { Server } from "socket.io";

/* ======================
   PATH
====================== */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ======================
   ENV
====================== */
const { SESSION_TOKEN, PORT = 10000 } = process.env;

if (!SESSION_TOKEN) {
	console.error("❌ SESSION_TOKEN missing");
	process.exit(1);
}

/* ======================
   EXPRESS
====================== */
const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

/* ======================
   HTTP + WS
====================== */
const httpServer = createServer(app);
const io = new Server(httpServer, {
	cors: { origin: "*" }
});

/* ======================
   SECURITY
====================== */
let lastNonce = 0;
let requestTimes = [];

function verify(req) {
	const { token, nonce, timestamp } = req.body;

	if (token !== SESSION_TOKEN) return false;
	if (nonce <= lastNonce) return false;
	if (Math.abs(Date.now() / 1000 - timestamp) > 10) return false;

	lastNonce = nonce;

	const now = Date.now();
	requestTimes.push(now);
	requestTimes = requestTimes.filter(t => now - t < 1000);

	return requestTimes.length < 40;
}

/* ======================
   LIVE STATE
====================== */
let players = [];
let lighting = {};
let killFeed = [];

const MAX_KILLS = 20;

/* ======================
   MAP
====================== */
app.post("/map", (req, res) => {
	if (!verify(req)) return res.sendStatus(403);

	players = Array.isArray(req.body.players)
		? req.body.players
		: [];

	res.sendStatus(200);
});

app.get("/map", (_, res) => {
	res.json(players);
});

/* ======================
   LIGHTING
====================== */
app.post("/lighting", (req, res) => {
	if (!verify(req)) return res.sendStatus(403);

	lighting = req.body.lighting || lighting;
	res.sendStatus(200);
});

app.get("/lighting", (_, res) => {
	res.json(lighting);
});

/* ======================
   KILL FEED
====================== */
app.post("/kill", (req, res) => {
	if (!verify(req)) return res.sendStatus(403);

	const { killer, victim } = req.body;
	if (!killer || !victim) return res.sendStatus(400);

	killFeed.unshift({
		killer,
		victim,
		time: Date.now()
	});

	killFeed = killFeed.slice(0, MAX_KILLS);

	io.emit("kill:feed", killFeed);
	res.sendStatus(200);
});

app.get("/kills", (_, res) => {
	res.json(killFeed);
});

/* ======================
   SPECTATORS (WS)
====================== */
const spectators = new Map();

io.on("connection", socket => {
	const spec = {
		id: socket.id,
		name: `Spectator ${socket.id.slice(0, 4)}`,
		color: `hsl(${Math.random() * 360},70%,60%)`,
		pos: { x: 0, y: 2000, z: 0 },
		dir: { x: 0, y: -1, z: 0 }
	};

	spectators.set(socket.id, spec);

	socket.emit("spectators:init", [...spectators.values()]);
	socket.broadcast.emit("spectator:join", spec);

	socket.on("spectator:update", data => {
		if (!data) return;
		Object.assign(spec, data);
		socket.broadcast.emit("spectator:update", spec);
	});

	socket.on("chat:send", msg => {
		if (typeof msg !== "string") return;
		if (msg.length > 120) return;

		io.emit("chat:msg", {
			from: spec.name,
			msg,
			time: Date.now()
		});
	});

	socket.on("disconnect", () => {
		spectators.delete(socket.id);
		socket.broadcast.emit("spectator:leave", socket.id);
	});
});

/* ======================
   START
====================== */
httpServer.listen(PORT, () => {
	console.log(`🚀 HG Relay running on port ${PORT}`);
});
