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

// Nonce protection
let lastNonce = 0;

// Rate limit (rolling window)
const RATE_WINDOW_MS = 1000;
const MAX_REQUESTS_PER_WINDOW = 25;

let requestTimes = [];

/* ======================
   GAME LIMITS
====================== */

// Arena bounds (STUDS)
const BOUNDS = {
	minX: -5000,
	maxX:  5000,
	minZ: -5000,
	maxZ:  5000
};

// Movement sanity (studs per second)
const MAX_SPEED = 300;

// Health sanity
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

// Track previous player positions
const lastPositions = new Map();

/* ======================
   HELPERS
====================== */

function rateLimitExceeded() {
	const now = Date.now();
	requestTimes = requestTimes.filter(t => now - t < RATE_WINDOW_MS);
	requestTimes.push(now);
	return requestTimes.length > MAX_REQUESTS_PER_WINDOW;
}

function verify(req) {
	const { token, nonce, timestamp } = req.body;

	if (token !== SESSION_TOKEN) return false;
	if (typeof nonce !== "number" || nonce <= lastNonce) return false;
	if (Math.abs(Date.now() / 1000 - timestamp) > 10) return false;
	if (rateLimitExceeded()) return false;

	lastNonce = nonce;
	return true;
}

function clamp(v, min, max) {
	return Math.max(min, Math.min(max, v));
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

		// Clamp bounds
		p.x = clamp(p.x, BOUNDS.minX, BOUNDS.maxX);
		p.z = clamp(p.z, BOUNDS.minZ, BOUNDS.maxZ);

		// Health clamp
		p.maxHealth = clamp(p.maxHealth || 100, 1, MAX_HEALTH);
		p.health = clamp(p.health || 0, 0, p.maxHealth);

		// Teleport / speed check
		const last = lastPositions.get(p.id);
		if (last) {
			const dt = (now - last.time) / 1000;
			const dx = p.x - last.x;
			const dz = p.z - last.z;
			const speed = Math.sqrt(dx * dx + dz * dz) / Math.max(dt, 0.016);

			if (speed > MAX_SPEED) {
				console.warn(`⚠️ Speed violation: ${p.id} (${speed.toFixed(1)} studs/s)`);
				continue; // drop this update
			}
		}

		lastPositions.set(p.id, {
			x: p.x,
			z: p.z,
			time: now
		});

		clean.push(p);
	}

	return clean;
}

/* ======================
   MAP ENDPOINTS
====================== */

app.post("/map", (req, res) => {
	if (!verify(req)) {
		console.warn("🚫 /map rejected");
		return res.sendStatus(403);
	}

	if (!Array.isArray(req.body.players)) {
		return res.sendStatus(400);
	}

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
	if (!verify(req)) {
		console.warn("🚫 /lighting rejected");
		return res.sendStatus(403);
	}

	if (req.body.lighting) {
		lighting = {
			...lighting,
			...req.body.lighting
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
