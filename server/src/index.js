import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import OpenAI from "openai";
import path from "path";

const app = express();
app.use(cors());

const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".pdf";
    cb(null, Date.now() + ext);
  },
});
const upload = multer({ storage });

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const PORT = process.env.PORT || 3001;

// 🔹 Prompt enforces schema
function buildPrompt() {
  return `
You are a clinical assistant specialized in interpreting blood test results.
Analyze the attached blood test report and return ONLY valid JSON (no text outside JSON).

Use this schema:

{
  "patient": {
    "name": "string",
    "age": "string",
    "sex": "string",
    "date": "string"
  },
  "abnormal_findings": [
    {
      "category": "string",
      "test": "string",
      "result": "string",
      "reference_range": "string",
      "note": "string"
    }
  ],
  "categorized_analysis": [
    {
      "category": "string",
      "summary": "string"
    }
  ],
  "summary": "string",
  "recommendations": "string",
  "follow_up": "string"
}
  `;
}

// 🔹 Fallback JSON cleaning
function safeParseJSON(text) {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {}

  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    let cleaned = match[0]
      .replace(/(\r\n|\n|\r)/gm, " ")
      .replace(/'/g, '"')
      .replace(/,\s*}/g, "}")
      .replace(/,\s*]/g, "]");

    try {
      return JSON.parse(cleaned);
    } catch (err) {
      console.error("❌ Still invalid JSON after cleanup:", err.message);
    }
  }
  return null;
}

app.post("/api/analyze", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const filePath = req.file.path;

  try {
    const file = await openai.files.create({
      file: fs.createReadStream(filePath),
      purpose: "assistants",
    });

    const prompt = buildPrompt();

    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      input: [
        { role: "user", content: [{ type: "input_text", text: prompt }] },
        { role: "user", content: [{ type: "input_file", file_id: file.id }] },
      ],
      temperature: 0.3,
    });

    fs.unlink(filePath, () => {}); // cleanup

    const parsed = safeParseJSON(response.output_text);

    if (parsed) {
      return res.json({ report: parsed });
    } else {
      return res.status(500).json({ error: "AI returned invalid JSON" });
    }
  } catch (err) {
    fs.unlink(filePath, () => {});
    console.error("❌ Analysis failed:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () =>
  console.log(`✅ Server listening on http://localhost:${PORT}`)
);
