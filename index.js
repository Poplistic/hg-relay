import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

/*
STATE STRUCTURE (authoritative)
*/
let state = {
  images: {
    // "Panel1": "rbxassetid://123456789"
  },
  announcement: {
    text: "",
    panels: [],
    color: [255, 215, 0]
  }
};

/*
GET FULL DOME STATE
*/
app.get("/dome", (req, res) => {
  res.json(state);
});

/*
SET / UPDATE IMAGE ON A PANEL
Body:
{
  "panel": "Panel1",
  "imageId": "123456789"
}
*/
app.post("/image", (req, res) => {
  const { panel, imageId } = req.body;

  if (!panel || !imageId) {
    return res.status(400).json({ error: "Missing panel or imageId" });
  }

  state.images[panel] = `rbxassetid://${imageId}`;
  res.json({ success: true });
});

/*
SET ANNOUNCEMENT
Body:
{
  "text": "LET THE GAMES BEGIN",
  "panels": [1,2,3,4],
  "color": [255,215,0]
}
*/
app.post("/announcement", (req, res) => {
  const { text, panels, color } = req.body;

  state.announcement = {
    text: text || "",
    panels: panels || [],
    color: color || [255, 215, 0]
  };

  res.json({ success: true });
});

/*
CLEAR EVERYTHING
*/
app.post("/clear", (req, res) => {
  state.images = {};
  state.announcement = { text: "", panels: [], color: [255,215,0] };
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Capitol Dome API running on port", PORT);
});
