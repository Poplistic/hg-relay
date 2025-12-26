import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

let state = {
  images: {},        // PanelName -> rbxassetid://
  announcement: {
    text: "",
    panels: [],
    color: [255,215,0]
  }
};

app.get("/dome", (req, res) => {
  res.json(state);
});

app.post("/image", (req, res) => {
  const { panel, imageId } = req.body;
  state.images[panel] = `rbxassetid://${imageId}`;
  res.json({ success: true });
});

app.post("/announcement", (req, res) => {
  const { text, panels, color } = req.body;
  state.announcement = {
    text,
    panels,
    color: color || [255,215,0]
  };
  res.json({ success: true });
});

app.post("/clear", (req, res) => {
  state.images = {};
  state.announcement = { text:"", panels:[] };
  res.json({ success:true });
});

app.listen(process.env.PORT || 3000);
