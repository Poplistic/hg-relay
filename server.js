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

// Serve static files (arena.obj, spectator HTML)
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
let killFeed = [];
const MAX_KILLS = 20;
let dead = [];

/* ======================
   WEAPONS
====================== */
const weapons = [
    "Sword","Bow","Spear","Dagger","Axe","Trident",
    "Club","Sling","Mace","Knife","Net","Fire","Poison"
];

function randomWeapon() {
    return weapons[Math.floor(Math.random() * weapons.length)];
}

/* ======================
   MAP ENDPOINTS
====================== */
app.post("/map", (req, res) => {
    if (!verify(req)) return res.sendStatus(403);
    if (!Array.isArray(req.body.players)) return res.sendStatus(400);
    players = req.body.players;
    res.sendStatus(200);
});

app.get("/map", (_, res) => res.json(players));

/* ======================
   KILL FEED
====================== */
app.post("/kill", (req, res) => {
    if (!verify(req)) return res.sendStatus(403);
    const { killer, victim, weapon } = req.body;
    if (!killer || !victim) return res.sendStatus(400);

    const w = weapon || randomWeapon();
    const text = `${killer} was slain by ${victim}${w ? " using "+w : ""}`;
    killFeed.unshift({ text, time: Date.now() });
    killFeed = killFeed.slice(0, MAX_KILLS);

    io.emit("kill:feed", killFeed);
    res.sendStatus(200);
});

app.get("/kills", (_, res) => res.json(killFeed));

/* ======================
   DEAD PLAYERS
====================== */
app.post("/death", (req, res) => {
    if (!verify(req)) return res.sendStatus(403);
    const { id, name, killer } = req.body;
    if (!id || !name) return res.sendStatus(400);

    dead.push({ id, name });

    if (killer) {
        const w = randomWeapon();
        const text = `${name} was slain by ${killer} using ${w}`;
        killFeed.unshift({ text, time: Date.now() });
        killFeed = killFeed.slice(0, MAX_KILLS);
        io.emit("kill:feed", killFeed);
    }

    res.sendStatus(200);
});

app.get("/dead", (_, res) => res.json(dead));
app.post("/reset-dead", (req, res) => {
    if (!verify(req)) return res.sendStatus(403);
    dead = [];
    killFeed = [];
    io.emit("kill:feed", killFeed);
    res.sendStatus(200);
});

/* ======================
   SOCKET.IO
====================== */
io.on("connection", socket => {
    socket.on("chat:send", msg => {
        if (typeof msg !== "string" || msg.length > 120) return;
        io.emit("chat:msg", { from: "Spectator", msg, time: Date.now() });
    });
});

/* ======================
   START SERVER
====================== */
httpServer.listen(PORT, () => {
    console.log(`🚀 HG Relay running on http://localhost:${PORT}`);
    console.log(`📦 Serving static files from /public`);
});
