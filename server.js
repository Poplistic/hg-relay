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

// ✅ STATIC FILES (arena.obj lives here)
const PUBLIC_DIR = path.join(__dirname, "public");
app.use(express.static(PUBLIC_DIR));

/* ======================
   HTTP + WS
====================== */
const httpServer = createServer(app);
const io = new Server(httpServer, {
	cors: { origin: "*" },
	maxHttpBufferSize: 1e6
});

/* ======================
   SECURITY
====================== */
let lastNonce = 0;
let times = [];

function verify(req) {
	const { token, nonce, timestamp } = req.body ?? {};

	if (token !== SESSION_TOKEN) return false;
	if (typeof nonce !== "number" || nonce <= lastNonce) return false;
	if (Math.abs(Date.now() / 1000 - timestamp) > 10) return false;

	lastNonce = nonce;
	times.push(Date.now());
	times = times.filter(t => Date.now() - t < 1000);
	return times.length < 40;
}

/* ======================
   LIVE STATE
====================== */
let players = [];
let lighting = {};

/* ======================
   MAP (PLAYER STATE)
====================== */
app.post("/map", (req, res) => {
	if (!verify(req)) return res.sendStatus(403);

	if (!Array.isArray(req.body.players)) {
		return res.sendStatus(400);
	}

	players = req.body.players;
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
   SPECTATORS + CHAT
====================== */
io.on("connection", socket => {
	socket.on("chat:send", msg => {
		if (typeof msg !== "string" || msg.length > 120) return;

		io.emit("chat:msg", {
			from: "Spectator",
			msg,
			time: Date.now()
		});
	});
});

/* ======================
   START
====================== */
httpServer.listen(PORT, () => {
	console.log(`🚀 HG Relay running on http://localhost:${PORT}`);
	console.log(`📦 Serving static files from /public`);
});

