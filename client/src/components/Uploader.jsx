import { useState } from "react";
import {
  Paper,
  Stack,
  Typography,
  Button,
  LinearProgress,
  Alert,
} from "@mui/material";
import ReportPreview from "./ReportPreview";

// ✅ Read API base from env (local vs production)
const API_BASE = import.meta.env.VITE_API_BASE || "";

export default function Uploader() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");

  const onFileChange = (e) => {
    setFile(e.target.files?.[0] || null);
    setReport(null);
    setError("");
  };

  const analyze = async () => {
    if (!file) return setError("Please choose a PDF first.");
    setLoading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch(`${API_BASE}/api/analyze`, {
        method: "POST",
        body: form,
      });

      const text = await res.text();
      console.log("Raw backend response:", text);

      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error("Backend did not return valid JSON");
      }

      if (!res.ok) throw new Error(json.error || "Failed to analyze");

      setReport(json.report);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Paper sx={{ p: 3 }}>
      <Stack spacing={2}>
        <Typography>Upload a blood test PDF and let AI analyze it.</Typography>

        <Button component="label" variant="outlined">
          {file ? file.name : "Choose PDF..."}
          <input
            type="file"
            accept="application/pdf"
            hidden
            onChange={onFileChange}
          />
        </Button>

        <Button variant="contained" onClick={analyze} disabled={loading}>
          Analyze
        </Button>

        {loading && <LinearProgress />}
        {error && <Alert severity="error">{error}</Alert>}
      </Stack>

      {report && <ReportPreview content={report} />}
    </Paper>
  );
}
