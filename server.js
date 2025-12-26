import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

/* ================= STATE ================= */

let players = {};   // id -> {id,x,y,z,alive}
let chunks = {};    // "cx,cz" -> blocks[]

/* ================= PLAYERS ================= */

// POST from GDMC exporter
app.post("/players", (req, res) => {
  for (const p of req.body) {
    players[p.id] = {
      id: p.id,
      x: p.x,
      y: p.y,
      z: p.z,
      alive: p.alive !== false
    };
  }
  res.sendStatus(200);
});

// GET for web
app.get("/players", (req, res) => {
  res.json(Object.values(players));
});

/* ================= CHUNKS ================= */

// POST chunk data
app.post("/chunks", (req, res) => {
  const { cx, cz, blocks } = req.body;
  chunks[`${cx},${cz}`] = blocks;
  res.sendStatus(200);
});

// GET nearby chunks
app.get("/chunks", (req, res) => {
  const cx = Number(req.query.cx);
  const cz = Number(req.query.cz);
  const r = Number(req.query.r || 2);

  const out = [];
  for (let x = cx - r; x <= cx + r; x++) {
    for (let z = cz - r; z <= cz + r; z++) {
      const key = `${x},${z}`;
      if (chunks[key]) {
        out.push({ cx: x, cz: z, blocks: chunks[key] });
      }
    }
  }
  res.json(out);
});

/* ================= FRONTEND ================= */

app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Hunger Games map running on port", PORT);
});
