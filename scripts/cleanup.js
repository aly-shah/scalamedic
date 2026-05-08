const { Pool } = require("pg");
const pool = new Pool({ connectionString: "postgresql://medicore_user:clinic_erp_dev@localhost:5432/medicore" });

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Delete demo patients (PT-xxxx codes)
    const demoPats = await client.query('SELECT id FROM patients WHERE "patientCode" LIKE $1', ["PT-%"]);
    const demoPatIds = demoPats.rows.map(r => r.id);
    console.log("Demo patients to remove:", demoPatIds.length);

    if (demoPatIds.length > 0) {
      const tables = ["appointments", "prescriptions", "consultation_notes", "follow_ups", "invoices", "triage_records", "skin_histories", "medical_histories", "patient_allergies", "patient_medications", "patient_documents", "patient_tags", "patient_packages"];
      for (const table of tables) {
        try {
          const r = await client.query(`DELETE FROM ${table} WHERE "patientId" = ANY($1::uuid[])`, [demoPatIds]);
          if (r.rowCount > 0) console.log(`  Deleted ${r.rowCount} from ${table}`);
        } catch(e) { /* skip */ }
      }
      const r = await client.query('DELETE FROM patients WHERE "patientCode" LIKE $1', ["PT-%"]);
      console.log("  Deleted", r.rowCount, "demo patients");
    }

    // 2. Delete original demo doctors
    const demoDocEmails = ["dr.kim@medicore.com", "dr.williams@medicore.com", "dr.chen@medicore.com", "dr.patel@medicore.com"];
    for (const email of demoDocEmails) {
      const doc = await client.query("SELECT id FROM users WHERE email = $1", [email]);
      if (doc.rows[0]) {
        await client.query('UPDATE patients SET "assignedDoctorId" = NULL WHERE "assignedDoctorId" = $1', [doc.rows[0].id]);
        await client.query('UPDATE appointments SET "doctorId" = NULL WHERE "doctorId" = $1', [doc.rows[0].id]).catch(() => {});
      }
    }
    const dd = await client.query("DELETE FROM users WHERE email = ANY($1::text[])", [demoDocEmails]);
    console.log("Deleted demo doctors:", dd.rowCount);

    // 3. Delete demo leads, notifications, appointments
    let r;
    r = await client.query("DELETE FROM leads"); console.log("Deleted leads:", r.rowCount);
    r = await client.query("DELETE FROM notifications"); console.log("Deleted notifications:", r.rowCount);
    r = await client.query("DELETE FROM appointments"); console.log("Deleted appointments:", r.rowCount);
    r = await client.query("DELETE FROM audit_logs"); console.log("Deleted audit_logs:", r.rowCount);

    // 4. Update branches
    const branches = await client.query("SELECT id FROM branches ORDER BY name");
    if (branches.rows.length >= 1) {
      await client.query('UPDATE branches SET name = $1, code = $2, address = $3, phone = $4 WHERE id = $5',
        ["Dr. Nakhoda\u2019s Skin Institute", "DNSI", "Karachi, Pakistan", "+92-XXX-XXXXXXX", branches.rows[0].id]);
      console.log("Updated branch 1");
    }
    if (branches.rows.length >= 2) {
      await client.query('UPDATE branches SET name = $1, code = $2, address = $3 WHERE id = $4',
        ["Lasersoft - The Skin Clinic", "LSC", "Karachi, Pakistan", branches.rows[1].id]);
      console.log("Updated branch 2");
    }
    if (branches.rows.length >= 3) {
      await client.query('UPDATE users SET "branchId" = $1 WHERE "branchId" = $2', [branches.rows[0].id, branches.rows[2].id]);
      await client.query('UPDATE patients SET "branchId" = $1 WHERE "branchId" = $2', [branches.rows[0].id, branches.rows[2].id]);
      await client.query("DELETE FROM branches WHERE id = $1", [branches.rows[2].id]);
      console.log("Removed 3rd branch");
    }

    // 5. Rename staff users
    await client.query("UPDATE users SET name = $1 WHERE email = $2", ["Dr. Tasneem (Admin)", "admin@medicore.com"]);
    await client.query("UPDATE users SET name = $1 WHERE email = $2", ["System Admin", "superadmin@medicore.com"]);
    await client.query("UPDATE users SET name = $1 WHERE email = $2", ["Front Desk", "reception@medicore.com"]);
    await client.query("UPDATE users SET name = $1 WHERE email = $2", ["Billing Dept", "billing@medicore.com"]);
    await client.query("UPDATE users SET name = $1 WHERE email = $2", ["Call Center", "callcenter@medicore.com"]);
    await client.query("UPDATE users SET name = $1 WHERE email = $2", ["Clinical Assistant", "nurse@medicore.com"]);
    console.log("Renamed staff users");

    // 6. Fix typos
    r = await client.query("UPDATE patients SET notes = REPLACE(notes, $1, $2) WHERE notes LIKE $3",
      ["Rejuventation", "Rejuvenation", "%Rejuventation%"]);
    console.log("Fixed typo in", r.rowCount, "patient notes");
    await client.query("UPDATE treatments SET name = $1 WHERE name = $2", ["Rejuvenation", "Rejuventation"]);

    // 7. Delete demo rooms that don't match clinic, update names
    await client.query("UPDATE rooms SET name = $1 WHERE name = $2", ["Laser Room 1", "Room 1"]);
    await client.query("UPDATE rooms SET name = $1 WHERE name = $2", ["Laser Room 2", "Room 2"]);
    await client.query("UPDATE rooms SET name = $1 WHERE name = $2", ["Consultation Room 1", "Room 3"]);
    await client.query("UPDATE rooms SET name = $1 WHERE name = $2", ["Consultation Room 2", "Room 4"]);
    await client.query("UPDATE rooms SET name = $1 WHERE name = $2", ["Treatment Room 1", "Room 5"]);
    await client.query("UPDATE rooms SET name = $1 WHERE name = $2", ["Treatment Room 2", "Room 6"]);
    await client.query("UPDATE rooms SET name = $1 WHERE name = $2", ["Skin Analysis Room", "Room 7"]);
    await client.query("UPDATE rooms SET name = $1 WHERE name = $2", ["Recovery Room", "Room 8"]);
    console.log("Updated room names");

    await client.query("COMMIT");
    console.log("\n=== CLEANUP DONE ===");

    // Final counts
    const counts = await client.query(`
      SELECT 'patients' as t, count(*) FROM patients
      UNION ALL SELECT 'users', count(*) FROM users
      UNION ALL SELECT 'branches', count(*) FROM branches
      UNION ALL SELECT 'treatments', count(*) FROM treatments
      UNION ALL SELECT 'doctors', count(*) FROM users WHERE role = 'DOCTOR'
      ORDER BY t
    `);
    counts.rows.forEach(r => console.log(`${r.t}: ${r.count}`));

  } catch(e) {
    await client.query("ROLLBACK");
    console.error("ERROR:", e.message);
  } finally {
    client.release();
    await pool.end();
  }
}
main();
