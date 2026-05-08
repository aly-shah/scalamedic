/**
 * Smoke-test the drug-interaction matrix. Runs a handful of clinically
 * meaningful pairs through checkRxGuards and prints PASS/FAIL.
 *
 *   npx tsx scripts/test-drug-guards.ts
 *
 * Not a unit-test framework — keeps the dev loop tight without
 * pulling jest/vitest into the deploy bundle.
 */
import { checkRxGuards } from "../src/lib/drug-guards";

interface Case {
  name: string;
  newRx: string[];
  active?: string[];
  allergies?: string[];
  gender?: "MALE" | "FEMALE";
  expectId: string;
  expectSeverity: "danger" | "warning";
}

const CASES: Case[] = [
  { name: "Iso + Doxy → CONTRAINDICATED",
    newRx: ["Isotretinoin 20mg", "Doxycycline 100mg"],
    expectId: "interaction-iso-tetracycline", expectSeverity: "danger" },
  { name: "MTX + Bactrim → CONTRAINDICATED",
    newRx: ["Methotrexate 7.5mg weekly"], active: ["Septran DS"],
    expectId: "interaction-mtx-trimethoprim", expectSeverity: "danger" },
  { name: "Cyclosporine + Simvastatin → MAJOR",
    newRx: ["Cyclosporine 100mg"], active: ["Simvastatin 40mg"],
    expectId: "interaction-cyclosporine-statin", expectSeverity: "danger" },
  { name: "Spironolactone + Lisinopril → MAJOR",
    newRx: ["Spironolactone 50mg"], active: ["Lisinopril 10mg"],
    expectId: "interaction-spiro-acei", expectSeverity: "danger" },
  { name: "Tetracycline + Iron → MODERATE",
    newRx: ["Doxycycline 100mg", "Ferrous sulphate 200mg"],
    expectId: "interaction-tetracycline-antacid", expectSeverity: "warning" },
  { name: "Tretinoin + BPO → MINOR",
    newRx: ["Tretinoin 0.05% cream", "Benzoyl peroxide 2.5%"],
    expectId: "interaction-tretinoin-bpo", expectSeverity: "warning" },
  { name: "Acitretin + MTX → CONTRAINDICATED",
    newRx: ["Acitretin 25mg"], active: ["Methotrexate"],
    expectId: "interaction-acitretin-mtx", expectSeverity: "danger" },
  { name: "Warfarin + Bactrim → MAJOR",
    newRx: ["Cotrimoxazole 960mg"], active: ["Warfarin 5mg"],
    expectId: "interaction-warfarin-trimethoprim", expectSeverity: "danger" },
  { name: "HCQ + Ondansetron → MAJOR (QT)",
    newRx: ["Ondansetron 8mg"], active: ["Hydroxychloroquine 200mg"],
    expectId: "interaction-hcq-qt", expectSeverity: "danger" },
  { name: "SSRI + MAOI → CONTRAINDICATED",
    newRx: ["Fluoxetine 20mg"], active: ["Phenelzine 15mg"],
    expectId: "interaction-ssri-maoi", expectSeverity: "danger" },
  // Negative case — same-class with only one drug shouldn't trip the rule
  { name: "Single tetracycline alone — no interaction expected",
    newRx: ["Doxycycline 100mg"],
    expectId: "__none__", expectSeverity: "warning" },
];

let pass = 0, fail = 0;

for (const c of CASES) {
  const warnings = checkRxGuards(
    c.newRx.map((n) => ({ name: n })),
    {
      gender: c.gender ?? null,
      allergies: (c.allergies || []).map((a) => ({ allergen: a })),
      medications: (c.active || []).map((m) => ({ name: m, isActive: true })),
    },
  );
  const found = warnings.find((w) => w.id === c.expectId);
  if (c.expectId === "__none__") {
    const interactionWarnings = warnings.filter((w) => w.id.startsWith("interaction-"));
    if (interactionWarnings.length === 0) {
      console.log(`✓ ${c.name}`);
      pass++;
    } else {
      console.log(`✗ ${c.name} — unexpected: ${interactionWarnings.map((w) => w.id).join(", ")}`);
      fail++;
    }
    continue;
  }
  if (found && found.severity === c.expectSeverity) {
    console.log(`✓ ${c.name}`);
    pass++;
  } else if (found) {
    console.log(`✗ ${c.name} — wrong severity: got ${found.severity}, expected ${c.expectSeverity}`);
    fail++;
  } else {
    console.log(`✗ ${c.name} — missing rule ${c.expectId}`);
    console.log(`   Got: ${warnings.map((w) => w.id).join(", ") || "(none)"}`);
    fail++;
  }
}

console.log(`\n${pass} passed, ${fail} failed (${CASES.length} total)`);
if (fail > 0) process.exit(1);
