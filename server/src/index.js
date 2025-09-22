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
Analyze the attached blood test report and return a structured JSON object ONLY (no extra text).
Respond ONLY with valid JSON. No markdown, comments, or prose outside the JSON.

Group the findings under clinical categories if possible, for example:
- HAEMATOLOGY
- IRON STATUS
- RENAL FUNCTION & METABOLIC
- LIVER FUNCTION
- LIPIDS & CARDIOVASCULAR RISK
- INFLAMMATORY MARKER & CVD RISK
- DIABETES & PANCREATIC
- INFECTIOUS DISEASE SEROLOGY
- THYROID FUNCTION
- TUMOUR MARKERS
- IMMUNOSEROLOGY
- URINALYSIS (Appearance, Urine Chemical, Microscopic)

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
      "category": "e.g. LIVER FUNCTION",
      "test": "string",
      "result": "string",
      "reference_range": "string or 'Not provided'",
      "note": "string explanation why abnormal"
    }
  ],
  "summary": "Concise clinical summary (3–5 sentences)",
  "recommendations": "Further tests or lifestyle/medication considerations",
  "follow_up": "Timeline for follow-up (e.g. 2 weeks)"
}

${note}`;
}

// 🔹 Safe JSON extraction
function safeParseJSON(text) {
  if (!text) return null;

  // If it's already parsed JSON
  if (typeof text === "object") return text;

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

    fs.unlink(filePath, () => {}); // cleanup temp file

    // ✅ Prefer structured output, fallback to text cleanup
    const parsed =
      response.output_parsed || safeParseJSON(response.output_text);

    if (parsed) {
      if (!Array.isArray(parsed.abnormal_findings)) {
        parsed.abnormal_findings = [];
      }
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
