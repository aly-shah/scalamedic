/**
 * Update imported patients with appointment history from CSV data:
 * - updatedAt = ModifiedDatetime (last visit)
 * - Create first + last appointment records
 * - Map Category to last treatment notes
 */
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const { randomUUID } = require("crypto");

const CSV_PATH = path.resolve(__dirname, "../../clinicea-patients-2026-04-08.csv");
const DB_URL = "postgresql://medicore_user:clinic_erp_dev@localhost:5432/medicore";
const pool = new Pool({ connectionString: DB_URL });

// CSV parser
function parseCSV(text) {
  const lines = text.split("\n");
  const headers = parseCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCSVLine(line);
    const row = {};
    headers.forEach((h, idx) => { row[h.trim()] = (values[idx] || "").trim(); });
    rows.push(row);
  }
  return rows;
}

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === "," && !inQuotes) { result.push(current); current = ""; }
    else { current += ch; }
  }
  result.push(current);
  return result;
}

// Doctor name normalization (same as import script)
const DOCTOR_MAP = {
  "dr tasneem nakhoda": "Dr. Tasneem Nakhoda",
  "dr. tasneem nakhoda": "Dr. Tasneem Nakhoda",
  "dr. tasneem": "Dr. Tasneem Nakhoda",
  "dr tasneem": "Dr. Tasneem Nakhoda",
  "tasneem nakhoda": "Dr. Tasneem Nakhoda",
  "dr ambreen zia": "Dr. Ambreen Zia",
  "dr.  ambreen": "Dr. Ambreen Zia",
  "dr. ambreen": "Dr. Ambreen Zia",
  "dr ambreen": "Dr. Ambreen Zia",
  "dr ayesha zafar": "Dr. Ayesha Zafar",
  "dr. ayesha zafar": "Dr. Ayesha Zafar",
  "dr ayesha": "Dr. Ayesha Zafar",
  "dr aasma zaidi": "Dr. Aasma Zaidi",
  "dr. aasma zaidi": "Dr. Aasma Zaidi",
  "dr. aasma": "Dr. Aasma Zaidi",
  "dr azeemah nakhoda": "Dr. Azeemah Nakhoda",
  "dr. azeemah nakhoda": "Dr. Azeemah Nakhoda",
  "dr. azeemah": "Dr. Azeemah Nakhoda",
  "sadaf khan": "Sadaf Khan",
  "noreen rahat": "Noreen Rahat",
  "noreen": "Noreen Rahat",
  "dr summiya": "Dr. Summiya",
  "dr. summiya": "Dr. Summiya",
  "dr. zaira": "Dr. Zaira",
  "dr zaira": "Dr. Zaira",
  "dr. maria": "Dr. Maria",
  "dr nida": "Dr. Nida",
  "dr. nida": "Dr. Nida",
  "dr sadia": "Dr. Sadia",
  "dr. sadia": "Dr. Sadia",
  "dr. meena": "Dr. Meena",
};

function normalizeDoctorName(raw) {
  if (!raw || raw.trim() === "") return null;
  const key = raw.trim().toLowerCase().replace(/\s+/g, " ");
  return DOCTOR_MAP[key] || raw.trim();
}

// Category to appointment type
function categoryToType(cat) {
  if (!cat) return "CONSULTATION";
  const lower = cat.toLowerCase();
  if (lower.includes("hair") || lower.includes("skin tightening") || lower.includes("body contouring") || lower.includes("lifting")) return "PROCEDURE";
  if (lower.includes("rejuv")) return "PROCEDURE";
  return "CONSULTATION";
}

function isValidDate(d) {
  return d && !d.startsWith("0001") && d !== "";
}

async function main() {
  const client = await pool.connect();

  try {
    console.log("Reading CSV...");
    const csvText = fs.readFileSync(CSV_PATH, "utf-8");
    const rows = parseCSV(csvText);
    console.log("Parsed", rows.length, "rows");

    // Load doctor ID map
    const doctorRes = await client.query("SELECT id, name FROM users WHERE role = 'DOCTOR'");
    const doctorIdMap = {};
    doctorRes.rows.forEach(d => { doctorIdMap[d.name] = d.id; });

    // Load patient ID map by patientCode
    const patientRes = await client.query('SELECT id, "patientCode" FROM patients');
    const patientIdMap = {};
    patientRes.rows.forEach(p => { patientIdMap[p.patientCode] = p.id; });

    // Get branch ID
    const branchRes = await client.query("SELECT id FROM branches ORDER BY name LIMIT 1");
    const branchId = branchRes.rows[0].id;

    let updatedPatients = 0;
    let createdAppointments = 0;
    let skipped = 0;
    const BATCH = 200;

    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      await client.query("BEGIN");

      try {
        for (const row of batch) {
          const fileNo = row.FileNo || "";
          const patientId = patientIdMap[fileNo];
          if (!patientId) { skipped++; continue; }

          const created = row.CreatedDatetime;
          const modified = row.ModifiedDatetime;
          const category = (row.Category || "").replace(/Rejuventation/g, "Rejuvenation");
          const doctorName = normalizeDoctorName(row.PreferredPractitionerName);
          const doctorId = doctorName ? (doctorIdMap[doctorName] || null) : null;
          const billedTotal = parseFloat(row.BilledTotal) || 0;
          const paidTotal = parseFloat(row.PaidTotal) || 0;
          const totalVisits = parseInt(row.NoOfTotalVisit) || 0;
          const noShows = parseInt(row.NoOfNoShow) || 0;

          // Build enriched notes
          const noteParts = [];
          if (category) noteParts.push("Last treatment: " + category);
          if (doctorName) noteParts.push("Last doctor: " + doctorName);
          if (billedTotal > 0) noteParts.push("Total billed: PKR " + billedTotal.toLocaleString());
          if (paidTotal > 0) noteParts.push("Total paid: PKR " + paidTotal.toLocaleString());
          if (billedTotal - paidTotal > 0) noteParts.push("Balance due: PKR " + (billedTotal - paidTotal).toLocaleString());
          if (totalVisits > 0) noteParts.push("Total visits: " + totalVisits);
          if (noShows > 0) noteParts.push("No-shows: " + noShows);
          if (row.PatientNotes) noteParts.push(row.PatientNotes);
          if (row.Remarks) noteParts.push(row.Remarks);
          const notes = noteParts.join("\n") || null;

          // Update patient: updatedAt = ModifiedDatetime, notes, assignedDoctorId
          let updatedAt = null;
          if (isValidDate(modified)) {
            try { updatedAt = new Date(modified); } catch {}
          }

          await client.query(
            `UPDATE patients SET
              "updatedAt" = COALESCE($1, "updatedAt"),
              notes = $2,
              "assignedDoctorId" = COALESCE($3, "assignedDoctorId")
            WHERE id = $4`,
            [updatedAt, notes, doctorId, patientId]
          );
          updatedPatients++;

          // Create first appointment (CreatedDatetime = first visit)
          if (isValidDate(created)) {
            const firstDate = new Date(created);
            const dateStr = firstDate.toISOString().split("T")[0];
            const timeStr = firstDate.toTimeString().slice(0, 5) || "10:00";

            await client.query(
              `INSERT INTO appointments (id, "appointmentCode", "patientId", "doctorId", "branchId", date, "startTime", "endTime", "durationMinutes", type, status, notes, "createdAt", "updatedAt")
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 30, $9, 'COMPLETED', $10, $11, $11)
               ON CONFLICT DO NOTHING`,
              [
                randomUUID(),
                "APT-" + fileNo + "-F",
                patientId,
                doctorId,
                branchId,
                dateStr,
                timeStr,
                timeStr,
                categoryToType(category),
                category ? "Treatment: " + category : "Initial consultation",
                firstDate,
              ]
            );
            createdAppointments++;
          }

          // Create last appointment (ModifiedDatetime = last visit) if different from first
          if (isValidDate(modified) && modified !== created) {
            const lastDate = new Date(modified);
            const dateStr = lastDate.toISOString().split("T")[0];
            const timeStr = lastDate.toTimeString().slice(0, 5) || "10:00";

            await client.query(
              `INSERT INTO appointments (id, "appointmentCode", "patientId", "doctorId", "branchId", date, "startTime", "endTime", "durationMinutes", type, status, notes, "createdAt", "updatedAt")
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 30, $9, 'COMPLETED', $10, $11, $11)
               ON CONFLICT DO NOTHING`,
              [
                randomUUID(),
                "APT-" + fileNo + "-L",
                patientId,
                doctorId,
                branchId,
                dateStr,
                timeStr,
                timeStr,
                categoryToType(category),
                category ? "Last treatment: " + category : "Last visit",
                lastDate,
              ]
            );
            createdAppointments++;
          }
        }

        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        console.error("Batch error at", i, ":", err.message);
      }

      if ((i + BATCH) % 2000 === 0 || i + BATCH >= rows.length) {
        console.log(`Progress: ${Math.min(i + BATCH, rows.length)}/${rows.length} | updated=${updatedPatients} appts=${createdAppointments} skipped=${skipped}`);
      }
    }

    console.log("\n=== DONE ===");
    console.log("Patients updated:", updatedPatients);
    console.log("Appointments created:", createdAppointments);
    console.log("Skipped (not found):", skipped);

    const ac = await client.query("SELECT count(*) FROM appointments");
    console.log("Total appointments:", ac.rows[0].count);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error("FATAL:", err); process.exit(1); });
