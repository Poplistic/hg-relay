import express from "express";
import path from "path";
import { fileURLToPath } from "url";

/* ======================
   PATH FIX
====================== */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ======================
   ENV
====================== */

const {
	SESSION_TOKEN,
	PORT = 10000
} = process.env;

if (!SESSION_TOKEN) throw new Error("SESSION_TOKEN missing");

/* ======================
   EXPRESS
====================== */

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

/* ======================
   SECURITY STATE
====================== */

// Nonce per token
const lastNonce = new Map();

// Rate limit per token
const RATE_WINDOW_MS = 1000;
const MAX_REQUESTS_PER_WINDOW = 25;
const requestTimes = new Map();

/* ======================
   GAME LIMITS
====================== */

const BOUNDS = {
	minX: -5000,
	maxX:  5000,
	minZ: -5000,
	maxZ:  5000
};

const MAX_SPEED = 300;
const MAX_HEALTH = 1000;

/* ======================
   LIVE STATE
====================== */

let players = [];
let lighting = {
	clockTime: 12,
	brightness: 2,
	fogColor: [5, 9, 20],
	fogDensity: 0.00035,
	haze: 0,
	sunDirection: [0, 1, 0]
};

const lastPositions = new Map();

/* ======================
   HELPERS
====================== */

function clamp(v, min, max) {
	return Math.max(min, Math.min(max, v));
}

function rateLimitExceeded(token) {
	const now = Date.now();
	const list = requestTimes.get(token) || [];
	const filtered = list.filter(t => now - t < RATE_WINDOW_MS);
	filtered.push(now);
	requestTimes.set(token, filtered);
	return filtered.length > MAX_REQUESTS_PER_WINDOW;
}

function verify(req) {
	const { token, nonce, timestamp } = req.body;

	if (token !== SESSION_TOKEN) return false;
	if (typeof nonce !== "number") return false;
	if (Math.abs(Date.now() / 1000 - timestamp) > 10) return false;
	if (rateLimitExceeded(token)) return false;

	const last = lastNonce.get(token) ?? 0;
	if (nonce <= last) return false;

	lastNonce.set(token, nonce);
	return true;
}

/* ======================
   SANITY CHECKS
====================== */

function sanitizePlayers(list) {
	const now = Date.now();
	const clean = [];

	for (const p of list) {
		if (
			typeof p.id !== "number" ||
			typeof p.x !== "number" ||
			typeof p.z !== "number"
		) continue;

		p.x = clamp(p.x, BOUNDS.minX, BOUNDS.maxX);
		p.z = clamp(p.z, BOUNDS.minZ, BOUNDS.maxZ);

		p.maxHealth = clamp(p.maxHealth || 100, 1, MAX_HEALTH);
		p.health = clamp(p.health || 0, 0, p.maxHealth);

		const last = lastPositions.get(p.id);
		if (last) {
			const dt = Math.max((now - last.time) / 1000, 0.016);
			const dx = p.x - last.x;
			const dz = p.z - last.z;
			const speed = Math.sqrt(dx * dx + dz * dz) / dt;

			if (speed > MAX_SPEED) {
				console.warn(`⚠️ Speed violation: ${p.id} (${speed.toFixed(1)})`);
				continue;
			}
		}

		lastPositions.set(p.id, { x: p.x, z: p.z, time: now });
		clean.push(p);
	}

	return clean;
}

/* ======================
   MAP ENDPOINTS
====================== */

app.post("/map", (req, res) => {
	if (!verify(req)) return res.sendStatus(403);
	if (!Array.isArray(req.body.players)) return res.sendStatus(400);

	players = sanitizePlayers(req.body.players);
	res.sendStatus(200);
});

app.get("/map", (_, res) => {
	res.json(players);
});

/* ======================
   LIGHTING ENDPOINTS
====================== */

app.post("/lighting", (req, res) => {
	if (!verify(req)) return res.sendStatus(403);

	const l = req.body.lighting;
	if (l) {
		lighting = {
			clockTime: clamp(l.clockTime ?? lighting.clockTime, 0, 24),
			brightness: clamp(l.brightness ?? lighting.brightness, 0, 10),
			fogColor: Array.isArray(l.fogColor) ? l.fogColor.slice(0, 3) : lighting.fogColor,
			fogDensity: clamp(l.fogDensity ?? lighting.fogDensity, 0, 1),
			haze: clamp(l.haze ?? lighting.haze, 0, 10),
			sunDirection: Array.isArray(l.sunDirection) ? l.sunDirection.slice(0, 3) : lighting.sunDirection
		};
	}

	res.sendStatus(200);
});

app.get("/lighting", (_, res) => {
	res.json(lighting);
});

/* ======================
   START
====================== */

app.listen(PORT, () => {
	console.log(`🚀 HG Relay hardened on port ${PORT}`);
});
