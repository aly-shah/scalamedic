/**
 * Import patients from Clinicea CSV into MediCore
 * Usage: node scripts/import-patients.js
 */
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const { randomUUID } = require("crypto");
const bcrypt = require("bcryptjs");

const CSV_PATH = path.resolve(__dirname, "../../clinicea-patients-2026-04-08.csv");
const DB_URL = process.env.DATABASE_URL || "postgresql://medicore_user:clinic_erp_dev@localhost:5432/medicore";

const pool = new Pool({ connectionString: DB_URL });

// ---- CSV Parser (handles quoted fields) ----
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

// ---- Doctor name normalization ----
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

// ---- Gender mapping ----
function mapGender(g) {
  if (!g) return "OTHER";
  const u = g.toUpperCase().trim();
  if (u === "F" || u === "FEMALE") return "FEMALE";
  if (u === "M" || u === "MALE") return "MALE";
  return "OTHER";
}

// ---- Treatments from CSV categories ----
const NEW_TREATMENTS = [
  { name: "Skin Tightening", code: "SKIN-TIGHT", category: "LASER" },
  { name: "Rejuvenation", code: "REJUV", category: "FACIAL" },
  { name: "Hair Loss Treatment", code: "HAIR-LOSS", category: "OTHER" },
  { name: "Body Contouring", code: "BODY-CONT", category: "OTHER" },
  { name: "Lifting", code: "LIFTING", category: "SURGICAL" },
];

// ---- Main ----
async function main() {
  const client = await pool.connect();

  try {
    console.log("Reading CSV...");
    const csvText = fs.readFileSync(CSV_PATH, "utf-8");
    const rows = parseCSV(csvText);
    console.log(`Parsed ${rows.length} rows`);

    // Get branch ID (use first branch)
    const branchRes = await client.query("SELECT id FROM branches LIMIT 1");
    const branchId = branchRes.rows[0].id;
    console.log("Using branch:", branchId);

    // ---- Step 1: Create doctors ----
    console.log("\n--- Creating doctors ---");
    const uniqueDoctors = new Set();
    rows.forEach(r => {
      const name = normalizeDoctorName(r.PreferredPractitionerName);
      if (name) uniqueDoctors.add(name);
    });

    const doctorIdMap = {}; // name -> id

    // Load existing doctors
    const existingDoctors = await client.query("SELECT id, name FROM users WHERE role = 'DOCTOR'");
    existingDoctors.rows.forEach(d => { doctorIdMap[d.name] = d.id; });

    const passwordHash = await bcrypt.hash("password123", 12);

    for (const name of uniqueDoctors) {
      if (doctorIdMap[name]) {
        console.log(`  Doctor exists: ${name}`);
        continue;
      }
      const id = randomUUID();
      const emailSlug = name.toLowerCase().replace(/[^a-z]/g, "").slice(0, 20);
      const email = `${emailSlug}@medicore.com`;

      // Check email doesn't clash
      const existing = await client.query("SELECT id FROM users WHERE email = $1", [email]);
      if (existing.rows.length > 0) {
        doctorIdMap[name] = existing.rows[0].id;
        console.log(`  Doctor email exists: ${name} -> ${email}`);
        continue;
      }

      await client.query(
        `INSERT INTO users (id, email, "passwordHash", name, role, "branchId", "isActive", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, 'DOCTOR', $5, true, NOW(), NOW())`,
        [id, email, passwordHash, name, branchId]
      );
      doctorIdMap[name] = id;
      console.log(`  Created doctor: ${name} (${email})`);
    }

    // ---- Step 2: Create treatments ----
    console.log("\n--- Creating treatments ---");
    const treatmentIdMap = {}; // name -> id
    const existingTreatments = await client.query("SELECT id, name FROM treatments");
    existingTreatments.rows.forEach(t => { treatmentIdMap[t.name.toLowerCase()] = t.id; });

    for (const t of NEW_TREATMENTS) {
      if (treatmentIdMap[t.name.toLowerCase()]) {
        console.log(`  Treatment exists: ${t.name}`);
        continue;
      }
      const existing = await client.query("SELECT id FROM treatments WHERE code = $1", [t.code]);
      if (existing.rows.length > 0) {
        treatmentIdMap[t.name.toLowerCase()] = existing.rows[0].id;
        console.log(`  Treatment code exists: ${t.name}`);
        continue;
      }
      const id = randomUUID();
      await client.query(
        `INSERT INTO treatments (id, name, code, category, description, duration, "basePrice", "isActive", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, 30, 0, true, NOW(), NOW())`,
        [id, t.name, t.code, t.category, `${t.name} treatment`]
      );
      treatmentIdMap[t.name.toLowerCase()] = id;
      console.log(`  Created treatment: ${t.name}`);
    }

    // ---- Step 3: Import patients in batches ----
    console.log("\n--- Importing patients ---");
    let imported = 0;
    let skipped = 0;
    let errors = 0;
    const BATCH = 100;

    // Get existing patient codes to skip duplicates
    const existingCodes = new Set();
    const codesRes = await client.query('SELECT "patientCode" FROM patients');
    codesRes.rows.forEach(r => existingCodes.add(r.patientCode));

    // Get existing phone numbers to skip duplicates
    const existingPhones = new Set();
    const phonesRes = await client.query("SELECT phone FROM patients WHERE phone IS NOT NULL AND phone != ''");
    phonesRes.rows.forEach(r => existingPhones.add(r.phone.replace(/\s/g, "")));

    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);

      await client.query("BEGIN");
      try {
        for (const row of batch) {
          const fileNo = row.FileNo || "";
          const phone = (row.Mobile || row.Phone || "").replace(/\s/g, "");

          // Skip if no name
          if (!row.FirstName && !row.Name) { skipped++; continue; }

          // Skip duplicates by patientCode
          if (fileNo && existingCodes.has(fileNo)) { skipped++; continue; }

          // Skip duplicates by phone
          if (phone && existingPhones.has(phone)) { skipped++; continue; }

          const id = randomUUID();
          const firstName = row.FirstName || row.Name?.split(" ")[0] || "Unknown";
          const middleName = row.MiddleName || null;
          const lastName = row.LastName || row.Name?.split(" ").slice(1).join(" ") || "";
          const email = row.Email || null;
          const gender = mapGender(row.Gender);
          const nationality = row.Nationality || null;
          const city = row.City || null;
          const address = [row.Address1, row.Address2, row.Locality].filter(Boolean).join(", ") || null;
          const bloodType = row.BloodGroup || null;
          const notes = [row.PatientNotes, row.Remarks, row.Category ? `Services: ${row.Category}` : ""].filter(Boolean).join("\n") || null;
          const isVip = row.IsVIPPatient === "true" || (row.Name || "").includes("VIP");
          const isActive = row.IsInactive !== "true";

          // DOB
          let dob = null;
          if (row.DOB && !row.DOB.startsWith("0001")) {
            try { dob = new Date(row.DOB).toISOString().split("T")[0]; } catch {}
          }

          // Doctor
          const doctorName = normalizeDoctorName(row.PreferredPractitionerName);
          const doctorId = doctorName ? (doctorIdMap[doctorName] || null) : null;

          // Created date
          let createdAt = new Date();
          if (row.CreatedDatetime && !row.CreatedDatetime.startsWith("0001")) {
            try { createdAt = new Date(row.CreatedDatetime); } catch {}
          }

          const patientCode = fileNo || `IMP-${String(imported + 1).padStart(5, "0")}`;

          await client.query(
            `INSERT INTO patients (id, "patientCode", "firstName", "middleName", "lastName", email, phone,
             "dateOfBirth", gender, nationality, address, city, "bloodType", notes,
             "isVip", "isActive", "branchId", "assignedDoctorId", "consentGiven",
             "createdAt", "updatedAt")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,true,$19,$19)`,
            [id, patientCode, firstName, middleName, lastName, email, phone || null,
             dob, gender, nationality, address, city, bloodType, notes,
             isVip, isActive, branchId, doctorId, createdAt]
          );

          existingCodes.add(patientCode);
          if (phone) existingPhones.add(phone);
          imported++;
        }
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        errors += batch.length;
        console.error(`  Batch error at row ${i}:`, err.message);
      }

      if ((i + BATCH) % 1000 === 0 || i + BATCH >= rows.length) {
        console.log(`  Progress: ${Math.min(i + BATCH, rows.length)}/${rows.length} | imported=${imported} skipped=${skipped} errors=${errors}`);
      }
    }

    console.log(`\n=== DONE ===`);
    console.log(`Total rows: ${rows.length}`);
    console.log(`Imported: ${imported}`);
    console.log(`Skipped (duplicates/empty): ${skipped}`);
    console.log(`Errors: ${errors}`);

    // Final count
    const finalCount = await client.query("SELECT count(*) FROM patients");
    console.log(`Total patients in DB: ${finalCount.rows[0].count}`);

    const doctorCount = await client.query("SELECT count(*) FROM users WHERE role = 'DOCTOR'");
    console.log(`Total doctors in DB: ${doctorCount.rows[0].count}`);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error("FATAL:", err); process.exit(1); });
