import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

let state = {
  images: [],
  announcement: {
    text: "",
    panels: [],
    color: [255, 215, 0]
  }
};

app.get("/dome", (req, res) => {
  res.json(state);
});

app.post("/image", (req, res) => {
  const image = req.body;
  state.images = state.images.filter(i => i.id !== image.id);
  state.images.push(image);
  res.json({ success: true });
});

app.post("/announcement", (req, res) => {
  state.announcement = req.body;
  res.json({ success: true });
});

app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Capitol Dome running on port", PORT);
});
