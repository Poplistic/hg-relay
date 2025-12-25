import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer } from "http";
import { Server } from "socket.io";

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
    if (Math.abs(Date.now()/1000 - timestamp) > 10) return false;
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
let dead = [];
const MAX_KILLS = 20;

/* ======================
   WEAPONS (Hunger Games style)
====================== */
const meleeWeapons = ["Sword","Dagger","Axe","Mace","Club","Knife","Spear"];
const rangedWeapons = ["Bow","Sling","Throwing Knife","Trident","Net"];
const traps = ["Fire","Poison","Explosive","Falling Rocks","Electric Trap"];

function generateDeathMessage(victim, killer) {
    let weaponType = Math.random();
    let weapon = "";
    let action = "";

    if (!killer) return `${victim} died.`;

    if (weaponType < 0.5) {
        weapon = meleeWeapons[Math.floor(Math.random()*meleeWeapons.length)];
        action = `was slain by ${killer} using ${weapon}`;
    } else if (weaponType < 0.85) {
        weapon = rangedWeapons[Math.floor(Math.random()*rangedWeapons.length)];
        action = `was killed by ${killer}'s ${weapon}`;
    } else {
        weapon = traps[Math.floor(Math.random()*traps.length)];
        action = `was caught in ${killer}'s ${weapon}`;
    }
    return `${victim} ${action}`;
}

/* ======================
   MAP ENDPOINTS
====================== */
app.post("/map", (req,res) => {
    if (!verify(req)) return res.sendStatus(403);
    if (!Array.isArray(req.body.players)) return res.sendStatus(400);
    players = req.body.players;
    res.sendStatus(200);
});
app.get("/map", (_, res) => res.json(players));

/* ======================
   KILL FEED
====================== */
app.post("/kill", (req,res) => {
    if (!verify(req)) return res.sendStatus(403);
    const { victim, killer } = req.body;
    if (!victim) return res.sendStatus(400);

    const text = generateDeathMessage(victim, killer);
    killFeed.unshift({ text, time: Date.now() });
    killFeed = killFeed.slice(0, MAX_KILLS);
    io.emit("kill:feed", killFeed);
    res.sendStatus(200);
});

app.get("/kills", (_,res) => res.json(killFeed));

/* ======================
   DEAD PLAYERS
====================== */
app.post("/death", (req,res) => {
    if (!verify(req)) return res.sendStatus(403);
    const { id, name, killer } = req.body;
    if (!id || !name) return res.sendStatus(400);

    dead.push({ id, name });

    const text = generateDeathMessage(name, killer);
    killFeed.unshift({ text, time: Date.now() });
    killFeed = killFeed.slice(0, MAX_KILLS);
    io.emit("kill:feed", killFeed);

    res.sendStatus(200);
});

app.get("/dead", (_,res) => res.json(dead));
app.post("/reset-dead", (req,res) => {
    if (!verify(req)) return res.sendStatus(403);
    dead = [];
    killFeed = [];
    io.emit("kill:feed", killFeed);
    res.sendStatus(200);
});

/* ======================
   ROBLOX BUST PROXY
====================== */
app.get("/bust/:id", async (req, res) => {
    const id = req.params.id;
    try {
        const url = `https://www.roblox.com/headshot-thumbnail/image?userId=${id}&width=150&height=150&format=png`;
        const response = await fetch(url);
        if (!response.ok) return res.sendStatus(response.status);

        const buffer = await response.arrayBuffer();
        res.setHeader("Content-Type", "image/png");
        res.send(Buffer.from(buffer));
    } catch (err) {
        console.error("Failed to fetch Roblox bust:", err);
        res.sendStatus(500);
    }
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
