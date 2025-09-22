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
Analyze the attached blood test report and return ONLY a JSON object (no extra text).  

⚠️ Respond ONLY with valid JSON. No markdown, comments, or prose outside the JSON.  

The JSON must follow this format:

{
  "patient": {
    "name": "string or 'Not specified'",
    "age": "string or 'Not specified'",
    "sex": "string or 'Not specified'",
    "date": "string or 'Not specified'"
  },
  "categories": {
    "Haematology": [
      {
        "test": "string",
        "result": "string",
        "reference_range": "string or 'Not provided'",
        "interpretation": "short clinical note"
      }
    ],
    "Iron Status": [...],
    "Renal Function & Metabolic": [...],
    "Liver Function": [...],
    "Lipids & Cardiovascular Risk": [...],
    "Inflammatory Marker & CVD Risk": [...],
    "Diabetes & Pancreatic": [...],
    "Infectious Disease Serology": [...],
    "Thyroid Function": [...],
    "Tumour Markers": [...],
    "Immunoserology": [...],
    "Urinalysis": {
      "Appearance": "summary or 'Not provided'",
      "Urine Chemical": "summary or 'Not provided'",
      "Microscopic": "summary or 'Not provided'"
    }
  },
  "abnormal_findings": [
    {
      "test": "string",
      "result": "string",
      "reference_range": "string or 'Not provided'",
      "note": "why abnormal"
    }
  ],
  "summary": "Clinical summary (3–4 sentences, key highlights from abnormal and important findings)",
  "recommendations": "Follow-up tests or lifestyle/medication considerations",
  "follow_up": "Suggested timeframe (e.g. 2–4 weeks)"
}

Instructions:
- Group all available tests under the correct category (if test not in list, put under 'Other').
- Always include an array for each category, even if empty.
- Under abnormal_findings, only list tests outside reference range or clinically relevant.
- Summaries should be clear, concise, and clinically useful.

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

    let response;

    try {
      // ✅ Try with schema enforcement
      response = await openai.responses.create({
        model: "gpt-4o-mini",
        input: [
          {
            role: "user",
            content: [{ type: "input_text", text: buildPrompt() }],
          },
          { role: "user", content: [{ type: "input_file", file_id: file.id }] },
        ],
        temperature: 0.4,
        text: {
          format: "json_schema",
          json_schema: {
            name: "lab_analysis_report",
            schema: {
              type: "object",
              properties: {
                patient: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    age: { type: "string" },
                    sex: { type: "string" },
                    date: { type: "string" },
                  },
                  required: ["name", "age", "sex", "date"],
                },
                abnormal_findings: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      test: { type: "string" },
                      result: { type: "string" },
                      reference_range: { type: "string" },
                      note: { type: "string" },
                    },
                    required: ["test", "result"],
                  },
                },
                summary: { type: "string" },
                recommendations: { type: "string" },
                follow_up: { type: "string" },
              },
              required: ["patient", "summary", "recommendations", "follow_up"],
            },
          },
        },
      });
    } catch (err) {
      // ❌ If schema not supported → fallback to plain JSON text mode
      if (err.message.includes("Unknown parameter")) {
        console.warn(
          "⚠️ Schema mode not supported, falling back to plain JSON parsing."
        );
        response = await openai.responses.create({
          model: "gpt-4o-mini",
          input: [
            {
              role: "user",
              content: [{ type: "input_text", text: buildPrompt() }],
            },
            {
              role: "user",
              content: [{ type: "input_file", file_id: file.id }],
            },
          ],
          temperature: 0.4,
        });
      } else {
        throw err;
      }
    }

    fs.unlink(filePath, () => {}); // cleanup temp file

    let parsed;

    if (response.output_parsed) {
      parsed = response.output_parsed;
    } else {
      const txt =
        response.output_text || response?.choices?.[0]?.message?.content || "";
      parsed = extractJSON(txt);
    }

    if (!parsed) {
      return res.status(500).json({ error: "AI returned invalid JSON." });
    }

    // 🟢 Ensure abnormal_findings always exists
    if (!Array.isArray(parsed.abnormal_findings)) {
      parsed.abnormal_findings = [];
    }

    return res.json({ report: parsed });
  } catch (err) {
    fs.unlink(filePath, () => {});
    console.error("❌ Analysis failed:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () =>
  console.log(`✅ Server listening on http://localhost:${PORT}`)
);
