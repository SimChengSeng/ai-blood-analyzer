import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import OpenAI from "openai";
import path from "path";

const app = express();
app.use(cors());

// ✅ Keep original PDF extension
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

// 🔹 Prompt
function buildPrompt(note = "") {
  return `You are a clinical assistant specialized in interpreting blood test results. 
Analyze the attached blood test report and return a JSON object ONLY (no extra text).
Respond ONLY with valid JSON. No markdown, comments, or prose outside the JSON.

The JSON format must be:

{
  "patient": {
    "name": "string or 'Not specified'",
    "age": "string or 'Not specified'",
    "sex": "string or 'Not specified'",
    "date": "string or 'Not specified'"
  },
  "abnormal_findings": [
    {
      "test": "string",
      "result": "string",
      "reference_range": "string or 'Not provided'",
      "note": "string explanation why abnormal"
    }
  ],
  "summary": "Concise clinical summary (2–3 sentences)",
  "recommendations": "Further tests or lifestyle/medication considerations",
  "follow_up": "Timeline for follow-up (e.g. 2 weeks)"
}

${note}`;
}

// 🔹 Extract JSON safely
function extractJSON(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch (err) {
      console.error("❌ JSON parse failed:", err.message);
    }
  }
  return null;
}

// 🔹 API Route
app.post("/api/analyze", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const filePath = req.file.path;

  try {
    // Upload PDF to OpenAI
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
      temperature: 0.4,
    });

    const txt =
      response.output_text || response?.choices?.[0]?.message?.content || "";

    fs.unlink(filePath, () => {}); // cleanup temp file

    if (txt && txt.trim()) {
      const parsed = extractJSON(txt);

      if (!parsed) {
        return res.status(500).json({ error: "AI returned invalid JSON." });
      }

      // 🟢 Ensure abnormal_findings always exists
      if (!Array.isArray(parsed.abnormal_findings)) {
        parsed.abnormal_findings = [];
      }

      return res.json({ report: parsed });
    } else {
      return res.status(500).json({ error: "AI returned empty report" });
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
