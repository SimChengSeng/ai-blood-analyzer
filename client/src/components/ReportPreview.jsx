import { Box, Typography, Paper, Button } from "@mui/material";
import html2pdf from "html2pdf.js";

export default function ReportPreview({ content }) {
  if (!content) return null;

  const downloadPDF = () => {
    const element = document.getElementById("report-content");
    html2pdf()
      .from(element)
      .set({
        margin: 15,
        filename: "lab_analysis_report.pdf",
        html2canvas: { scale: 2 },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      })
      .save();
  };

  // Normalize categories
  const normalizedCategories = {};
  (content.categorized_analysis || []).forEach((c) => {
    if (!c.category) return;
    const key = c.category.trim().toLowerCase();
    normalizedCategories[key] = c.summary;
  });

  const categoryOrder = [
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

  return (
    <Paper elevation={3} sx={{ mt: 4, p: 3 }}>
      <Typography variant="h6" gutterBottom>
        AI Analysis Report
      </Typography>

      <Box
        id="report-content"
        sx={{
          fontFamily: "Times New Roman, serif",
          color: "#000",
          lineHeight: 1.6,
          "& h2": { textAlign: "center", marginBottom: 2 },
          "& h3": { marginTop: 2, marginBottom: 1 },
          "& p, & li": { fontSize: "13px" },
        }}
      >
        <h2>Medical Laboratory Analysis Report</h2>

        {/* Patient Info */}
        <h3>Patient Information</h3>
        <p>
          <b>Name:</b> {content.patient?.name || "Not specified"}
        </p>
        <p>
          <b>Age:</b> {content.patient?.age || "Not specified"}
        </p>
        <p>
          <b>Sex:</b> {content.patient?.sex || "Not specified"}
        </p>
        <p>
          <b>Date:</b> {content.patient?.date || "Not specified"}
        </p>
        <hr />

        {/* Category Summaries */}
        <h3>Lab Category Summaries</h3>
        {categoryOrder.map((cat) => {
          const key = cat.toLowerCase();
          if (!normalizedCategories[key]) return null;
          return (
            <div key={cat} style={{ marginBottom: "20px" }}>
              <h4 style={{ marginBottom: "6px", color: "#222" }}>{cat}</h4>
              <p>{normalizedCategories[key]}</p>
              <hr />
            </div>
          );
        })}

        {/* Abnormal Findings */}
        <h3>Abnormal Findings</h3>
        {content.abnormal_findings?.length > 0 ? (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "13px",
            }}
          >
            <thead>
              <tr style={{ background: "#f5f5f5" }}>
                <th
                  style={{
                    border: "1px solid #ccc",
                    padding: "6px",
                    fontWeight: "bold",
                  }}
                >
                  Test
                </th>
                <th
                  style={{
                    border: "1px solid #ccc",
                    padding: "6px",
                    fontWeight: "bold",
                  }}
                >
                  Result
                </th>
                <th
                  style={{
                    border: "1px solid #ccc",
                    padding: "6px",
                    fontWeight: "bold",
                  }}
                >
                  Reference
                </th>
                <th
                  style={{
                    border: "1px solid #ccc",
                    padding: "6px",
                    fontWeight: "bold",
                  }}
                >
                  Note
                </th>
              </tr>
            </thead>
            <tbody>
              {content.abnormal_findings.map((f, idx) => (
                <tr key={idx}>
                  <td style={{ border: "1px solid #ccc", padding: "6px" }}>
                    {f.test}
                  </td>
                  <td style={{ border: "1px solid #ccc", padding: "6px" }}>
                    {f.result}
                  </td>
                  <td style={{ border: "1px solid #ccc", padding: "6px" }}>
                    {f.reference_range || "Not provided"}
                  </td>
                  <td style={{ border: "1px solid #ccc", padding: "6px" }}>
                    {f.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No abnormal findings detected.</p>
        )}
        <hr />

        {/* Overall Summary */}
        <h3>Overall Summary</h3>
        <p>{content.summary || "Not specified"}</p>
        <hr />

        {/* Recommendations */}
        <h3>Recommendations</h3>
        <p>{content.recommendations || "Not specified"}</p>
        <hr />

        {/* Follow-up */}
        <h3>Follow-up</h3>
        <p>{content.follow_up || "Not specified"}</p>

        <div
          style={{
            marginTop: "40px",
            fontSize: "11px",
            textAlign: "center",
            color: "#444",
          }}
        >
          <hr />
          <p>
            Generated by AI Assistant – For clinical support only, not a
            substitute for physician judgment.
          </p>
        </div>
      </Box>

      <Button variant="contained" sx={{ mt: 2 }} onClick={downloadPDF}>
        Download PDF
      </Button>
    </Paper>
  );
}
