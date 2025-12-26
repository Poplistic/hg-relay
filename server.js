import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer } from "http";
import { Server } from "socket.io";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { SESSION_TOKEN, PORT = 10000 } = process.env;
if (!SESSION_TOKEN) {
    console.error("❌ SESSION_TOKEN missing");
    process.exit(1);
}

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

/* ====================== PER-SERVER SECURITY ====================== */
// serverId => { lastNonce, times[] }
const serverState = new Map();

function verify(req) {
    const { token, nonce, timestamp, serverId } = req.body ?? {};

    if (token !== SESSION_TOKEN) return false;
    if (typeof serverId !== "string") return false;
    if (typeof nonce !== "number") return false;
    if (typeof timestamp !== "number") return false;

    // 15s time window
    if (Math.abs(Date.now() - timestamp * 1000) > 15000) return false;

    let state = serverState.get(serverId);
    if (!state) {
        state = { lastNonce: 0, times: [] };
        serverState.set(serverId, state);
    }

    if (nonce <= state.lastNonce) return false;
    state.lastNonce = nonce;

    const now = Date.now();
    state.times.push(now);
    state.times = state.times.filter(t => now - t < 1000);

    // per-server rate limit
    return state.times.length < 40;
}

/* ====================== LIVE STATE ====================== */
// serverId => players[]
const playersByServer = new Map();

// serverId => killFeed[]
const killFeedByServer = new Map();

// serverId => dead[]
const deadByServer = new Map();

const MAX_KILLS = 20;

/* ====================== WEAPONS ====================== */
const meleeWeapons = ["Sword","Dagger","Axe","Mace","Club","Knife","Spear"];
const rangedWeapons = ["Bow","Sling","Throwing Knife","Trident","Net"];
const traps = ["Fire","Poison","Explosive","Falling Rocks","Electric Trap"];

function generateDeathMessage(victim, killer) {
    if (!killer) return `${victim} died.`;

    const roll = Math.random();
    let weapon, action;

    if (roll < 0.5) {
        weapon = meleeWeapons[Math.floor(Math.random() * meleeWeapons.length)];
        action = `was slain by ${killer} using ${weapon}`;
    } else if (roll < 0.85) {
        weapon = rangedWeapons[Math.floor(Math.random() * rangedWeapons.length)];
        action = `was killed by ${killer}'s ${weapon}`;
    } else {
        weapon = traps[Math.floor(Math.random() * traps.length)];
        action = `was caught in ${killer}'s ${weapon}`;
    }

    return `${victim} ${action}`;
}

/* ====================== MAP ====================== */
app.post("/map", (req, res) => {
    if (!verify(req)) return res.sendStatus(403);

    const { serverId, players } = req.body;
    if (!Array.isArray(players)) return res.sendStatus(400);

    playersByServer.set(serverId, players);
    io.to(serverId).emit("map:update", players);

    res.sendStatus(200);
});

app.get("/map/:serverId", (req, res) => {
    res.json(playersByServer.get(req.params.serverId) ?? []);
});

/* ====================== KILL FEED ====================== */
app.post("/kill", (req, res) => {
    if (!verify(req)) return res.sendStatus(403);

    const { serverId, victim, killer } = req.body;
    if (!victim) return res.sendStatus(400);

    const feed = killFeedByServer.get(serverId) ?? [];
    const text = generateDeathMessage(victim, killer);

    feed.unshift({ text, time: Date.now() });
    feed.splice(MAX_KILLS);
    killFeedByServer.set(serverId, feed);

    io.to(serverId).emit("kill:feed", feed);
    res.sendStatus(200);
});

app.get("/kills/:serverId", (req, res) => {
    res.json(killFeedByServer.get(req.params.serverId) ?? []);
});

/* ====================== DEAD ====================== */
app.post("/death", (req, res) => {
    if (!verify(req)) return res.sendStatus(403);

    const { serverId, id, name, killer } = req.body;
    if (!id || !name) return res.sendStatus(400);

    const dead = deadByServer.get(serverId) ?? [];
    dead.push({ id, name });
    deadByServer.set(serverId, dead);

    const feed = killFeedByServer.get(serverId) ?? [];
    const text = generateDeathMessage(name, killer);
    feed.unshift({ text, time: Date.now() });
    feed.splice(MAX_KILLS);
    killFeedByServer.set(serverId, feed);

    io.to(serverId).emit("kill:feed", feed);
    res.sendStatus(200);
});

app.post("/reset-dead", (req, res) => {
    if (!verify(req)) return res.sendStatus(403);

    const { serverId } = req.body;
    deadByServer.set(serverId, []);
    killFeedByServer.set(serverId, []);

    io.to(serverId).emit("kill:feed", []);
    res.sendStatus(200);
});

/* ====================== SOCKET.IO ====================== */
io.on("connection", socket => {
    socket.on("join", serverId => {
        if (typeof serverId === "string") {
            socket.join(serverId);
        }
    });
});

/* ====================== START ====================== */
httpServer.listen(PORT, () => {
    console.log(`🚀 HG Relay running on port ${PORT}`);
});
