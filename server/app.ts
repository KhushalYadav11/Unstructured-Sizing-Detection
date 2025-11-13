import express from "express";
import path from "path";
import cors from "cors";
import reconstructRouter from "./routes/reconstruct";

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded assets (models, textures, logs)
const uploadsPath = path.join(process.cwd(), "uploads");
app.use("/uploads", express.static(uploadsPath, { index: false }));

// Register reconstruct router
app.use(reconstructRouter);

// Health
app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});