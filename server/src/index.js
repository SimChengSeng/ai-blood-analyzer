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

// ✅ Fixed category enum
const categoryEnum = [
  "Haematology",
  "Iron Status",
  "Renal Function & Metabolic",
  "Liver Function",
  "Lipids & Cardiovascular Risk",
  "Inflammatory Marker & CVD Risk",
  "Diabetes & Pancreatic",
  "Infectious Disease Serology",
  "Thyroid Function",
  "Tumour Markers",
  "Immunoserology",
  "Urinalysis",
  "Other",
];

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

    // ✅ Ask model to analyze with schema
    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Analyze the attached blood test and return JSON only.",
            },
          ],
        },
        { role: "user", content: [{ type: "input_file", file_id: file.id }] },
      ],
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
                    category: { type: "string", enum: categoryEnum },
                    test: { type: "string" },
                    result: { type: "string" },
                    reference_range: { type: "string" },
                    note: { type: "string" },
                  },
                  required: ["category", "test", "result"],
                },
              },
              categorized_analysis: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    category: { type: "string", enum: categoryEnum },
                    summary: { type: "string" },
                  },
                  required: ["category", "summary"],
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

    fs.unlink(filePath, () => {}); // cleanup temp file

    if (response.output_parsed) {
      return res.json({ report: response.output_parsed });
    } else {
      return res.status(500).json({ error: "AI returned no structured JSON" });
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
