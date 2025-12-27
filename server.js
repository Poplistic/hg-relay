const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(cors());
app.use(express.json());

const SECRET = process.env.JWT_SECRET || "supersecretkey";

/* ===== ADMIN ACCOUNT (CHANGE THESE) ===== */
const ADMIN_USER = "admin";
const ADMIN_PASSWORD_HASH = bcrypt.hashSync("Pmy0vJa9JtUVqBjkVZEq", 10);

/* ===== SKY OBJECT DATA ===== */
let skyObjects = [
  {
    id: "main_banner",
    imageId: "rbxassetid://0",
    text: "100TH HUNGER GAMES",
    radius: 700,
    height: 350,
    speed: 0.15
  }
];

/* ===== AUTH ===== */
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (username !== ADMIN_USER) {
    return res.status(401).json({ error: "Invalid login" });
  }

  const valid = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
  if (!valid) {
    return res.status(401).json({ error: "Invalid login" });
  }

  const token = jwt.sign({ username }, SECRET, { expiresIn: "2h" });
  res.json({ token });
});

function auth(req, res, next) {
  const token = req.headers.authorization;
  if (!token) return res.sendStatus(403);

  try {
    jwt.verify(token, SECRET);
    next();
  } catch {
    res.sendStatus(403);
  }
}

/* ===== API ===== */
app.get("/sky", (req, res) => {
  res.json(skyObjects);
});

app.post("/sky", auth, (req, res) => {
  skyObjects = req.body;
  res.json({ success: true });
});

app.listen(3000, () => console.log("Sky API running"));
