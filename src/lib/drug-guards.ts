/**
 * Drug-safety rules — hardcoded for the clinic's top dermatology
 * prescriptions. NOT a commercial drug-interaction database. The
 * goal is to surface the obvious red flags before the doctor saves
 * an Rx; anything subtle requires the doctor's clinical judgment
 * (and we explicitly don't try to replace it).
 *
 * Adding rules: keep the matchers conservative — false positives
 * train the doctor to dismiss the banner without reading. Each
 * rule fires at most once per Rx.
 *
 * v53/Tier-4 extension: pairwise drug-drug interactions live in the
 * INTERACTIONS table at the bottom of the file. Each rule names
 * either drug *classes* (so adding a new tetracycline doesn't need
 * a rule update) or specific drugs.
 */

export type GuardSeverity = "warning" | "danger";

export interface GuardWarning {
  id: string;            // stable per-rule id, unique across the form
  severity: GuardSeverity;
  title: string;         // short headline shown in the banner
  detail: string;        // longer explanation under the headline
  affectedItems: string[]; // medicine names that triggered the rule
  /** Optional clinical action ("hold X", "monitor INR weekly", etc).
   *  Drug-drug interaction rules populate this; older rules don't. */
  recommendation?: string;
}

export interface GuardPatient {
  gender?: string | null;          // MALE / FEMALE / OTHER
  allergies?: Array<{ allergen: string }>;
  medications?: Array<{ name: string; isActive?: boolean }>;
}

export interface GuardRxItem {
  name: string;
  route?: string;
}

const TERATOGENS = [
  { match: /isotretinoin|accutane|roaccutane/i, label: "Isotretinoin" },
  { match: /\bdoxycycline\b/i, label: "Doxycycline" },
  { match: /\bminocycline\b/i, label: "Minocycline" },
  { match: /\btetracycline\b/i, label: "Tetracycline" },
  { match: /\bfinasteride\b/i, label: "Finasteride" },
];

const TOPICAL_RETINOID = /tretinoin|adapalene|tazarotene|retinol/i;
const HYDROQUINONE = /hydroquinone/i;
const SYSTEMIC_STEROID = /\bprednisolone\b|\bprednisone\b|\bmethylprednisolone\b|\bdexamethasone\b/i;
const TOPICAL_STEROID = /mometasone|clobetasol|betamethasone|hydrocortisone|fluocinolone|fluticasone|triamcinolone/i;

/**
 * Run all guards against the proposed Rx. Returns an array of
 * warnings, ordered by severity (danger first). Empty array means
 * the doctor can save without prompts.
 */
export function checkRxGuards(items: GuardRxItem[], patient: GuardPatient): GuardWarning[] {
  const warnings: GuardWarning[] = [];
  const itemNames = items.map((i) => i.name.trim()).filter((n) => n.length > 0);
  if (itemNames.length === 0) return warnings;

  // ─── Allergy conflicts ────────────────────────────────────
  const allergens = (patient.allergies || []).map((a) => a.allergen.trim()).filter(Boolean);
  for (const allergen of allergens) {
    const lower = allergen.toLowerCase();
    const hits = itemNames.filter((n) => n.toLowerCase().includes(lower));
    if (hits.length > 0) {
      warnings.push({
        id: `allergy-${lower}`,
        severity: "danger",
        title: `Allergy: ${allergen}`,
        detail: `Patient is recorded as allergic to ${allergen}. Verify before prescribing.`,
        affectedItems: hits,
      });
    }
  }

  // ─── Teratogens for female patients ───────────────────────
  // We don't have a pregnancy flag on patients (yet), so we err on
  // the side of asking. Banner is a reminder, not a hard block.
  const isFemale = (patient.gender || "").toUpperCase() === "FEMALE";
  if (isFemale) {
    for (const t of TERATOGENS) {
      const hits = itemNames.filter((n) => t.match.test(n));
      if (hits.length > 0) {
        warnings.push({
          id: `teratogen-${t.label.toLowerCase()}`,
          severity: "danger",
          title: `${t.label} — pregnancy category X`,
          detail: `${t.label} is teratogenic. Confirm a recent negative β-hCG and contraception plan before dispensing.`,
          affectedItems: hits,
        });
      }
    }

    // Topical retinoids + hydroquinone are weaker but still
    // contraindicated in pregnancy. Single warning row each.
    const retinoidHits = itemNames.filter((n) => TOPICAL_RETINOID.test(n));
    if (retinoidHits.length > 0) {
      warnings.push({
        id: "topical-retinoid-pregnancy",
        severity: "warning",
        title: "Topical retinoid — avoid in pregnancy",
        detail: "Tretinoin/Adapalene/Tazarotene are best avoided during pregnancy. Confirm patient is not pregnant or planning.",
        affectedItems: retinoidHits,
      });
    }
    const hqHits = itemNames.filter((n) => HYDROQUINONE.test(n));
    if (hqHits.length > 0) {
      warnings.push({
        id: "hydroquinone-pregnancy",
        severity: "warning",
        title: "Hydroquinone — avoid in pregnancy",
        detail: "Hydroquinone has high systemic absorption and is not recommended during pregnancy or lactation.",
        affectedItems: hqHits,
      });
    }
  }

  // ─── Steroid overlap ──────────────────────────────────────
  // If the new Rx contains a systemic steroid AND the patient is
  // already on a topical (or vice versa), flag the overlap.
  const newSystemic = itemNames.filter((n) => SYSTEMIC_STEROID.test(n));
  const newTopical = itemNames.filter((n) => TOPICAL_STEROID.test(n));
  const activeMeds = (patient.medications || []).filter((m) => m.isActive !== false).map((m) => m.name);
  const existingSystemic = activeMeds.filter((n) => SYSTEMIC_STEROID.test(n));
  const existingTopical = activeMeds.filter((n) => TOPICAL_STEROID.test(n));

  if (newSystemic.length > 0 && (existingSystemic.length > 0 || existingTopical.length > 0)) {
    warnings.push({
      id: "steroid-overlap-systemic",
      severity: "warning",
      title: "Steroid overlap",
      detail: `Patient is already on ${[...existingSystemic, ...existingTopical].join(", ")}. Adding a systemic steroid stacks immunosuppressive load.`,
      affectedItems: newSystemic,
    });
  }
  if (newTopical.length > 0 && existingSystemic.length > 0) {
    warnings.push({
      id: "steroid-overlap-topical",
      severity: "warning",
      title: "Topical steroid + systemic steroid",
      detail: `Patient is already on ${existingSystemic.join(", ")} systemically. Verify the topical addition is needed.`,
      affectedItems: newTopical,
    });
  }
  if (newTopical.length >= 2) {
    warnings.push({
      id: "multi-topical-steroid",
      severity: "warning",
      title: "Multiple topical steroids",
      detail: "Two or more topical corticosteroids on one prescription — confirm this is intentional and locations don't overlap.",
      affectedItems: newTopical,
    });
  }

  // ─── Pairwise drug-drug interactions ──────────────────────
  // Check both new-vs-active (existing chronic meds) and new-vs-new
  // (other items on this same Rx). Each interaction surfaces once
  // even if multiple items match the same class pair.
  warnings.push(...checkInteractions(itemNames, activeMeds));

  // Order: danger first, then warning, deduplicated by id.
  const seen = new Set<string>();
  return warnings
    .filter((w) => (seen.has(w.id) ? false : (seen.add(w.id), true)))
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "danger" ? -1 : 1));
}

// ============================================================
// Drug-drug interaction database
// ============================================================

/** Drug classes used in interaction rules. A drug name matches a
 *  class if its lowercased form contains any of the class's regex
 *  fragments. Classes are derm-relevant + a small handful of common
 *  comorbidity meds whose interactions matter at the prescribing
 *  desk (e.g. warfarin, statins, ACEi). */
type DrugClass =
  | "tetracycline"
  | "isotretinoin"
  | "acitretin"
  | "topical-retinoid"
  | "vitamin-a"
  | "methotrexate"
  | "trimethoprim-sulfa"
  | "nsaid"
  | "salicylate"
  | "warfarin"
  | "cyclosporine"
  | "statin"
  | "macrolide"
  | "azole-antifungal"
  | "spironolactone"
  | "ace-inhibitor"
  | "potassium-supplement"
  | "hydroxychloroquine"
  | "qt-prolonging"
  | "dapsone"
  | "topical-antibiotic"
  | "benzoyl-peroxide"
  | "antacid-iron-calcium"
  | "oral-contraceptive"
  | "ssri-snri"
  | "maoi"
  | "alcohol";

const CLASS_PATTERNS: Record<DrugClass, RegExp> = {
  "tetracycline":          /\b(doxycycline|minocycline|tetracycline|lymecycline|sarecycline)\b/i,
  "isotretinoin":          /\b(isotretinoin|accutane|roaccutane|claravis)\b/i,
  "acitretin":             /\bacitretin\b/i,
  "topical-retinoid":      /\b(tretinoin|adapalene|tazarotene|trifarotene|retinol)\b/i,
  "vitamin-a":             /\bvitamin\s*a\b|\bretinyl\b/i,
  "methotrexate":          /\bmethotrexate\b|\bmtx\b/i,
  "trimethoprim-sulfa":    /\b(trimethoprim|sulfamethoxazole|cotrimoxazole|bactrim|septra|septran)\b/i,
  "nsaid":                 /\b(ibuprofen|naproxen|diclofenac|celecoxib|ketorolac|indomethacin|meloxicam|piroxicam|etoricoxib|mefenamic)\b/i,
  "salicylate":            /\b(aspirin|acetylsalicylic)\b/i,
  "warfarin":              /\bwarfarin\b/i,
  "cyclosporine":          /\b(cyclosporine|ciclosporin|cyclosporin)\b/i,
  "statin":                /\b(simvastatin|atorvastatin|rosuvastatin|pravastatin|lovastatin|fluvastatin|pitavastatin)\b/i,
  "macrolide":             /\b(erythromycin|clarithromycin|azithromycin)\b/i,
  "azole-antifungal":      /\b(ketoconazole|itraconazole|fluconazole|voriconazole|posaconazole)\b/i,
  "spironolactone":        /\bspironolactone\b/i,
  "ace-inhibitor":         /\b(lisinopril|enalapril|ramipril|captopril|perindopril|losartan|valsartan|telmisartan|irbesartan|olmesartan)\b/i,
  "potassium-supplement":  /\bpotassium\s*chloride\b|\bk-?dur\b|\bkcl\b/i,
  "hydroxychloroquine":    /\bhydroxychloroquine\b|\bplaquenil\b/i,
  "qt-prolonging":         /\b(haloperidol|amiodarone|sotalol|quinidine|ondansetron|ciprofloxacin|levofloxacin|moxifloxacin|methadone)\b/i,
  "dapsone":               /\bdapsone\b/i,
  "topical-antibiotic":    /\b(clindamycin|erythromycin|metronidazole|mupirocin|fusidic)\b/i,
  "benzoyl-peroxide":      /\bbenzoyl\s*peroxide\b/i,
  "antacid-iron-calcium":  /\b(antacid|aluminium|magnesium|sucralfate|ferrous|iron\s*sulphate|iron\s*sulfate|calcium\s*carbonate)\b/i,
  "oral-contraceptive":    /\b(ethinyl\s*estradiol|levonorgestrel|drospirenone|norgestimate|combined\s*oral\s*contraceptive|ocp)\b/i,
  "ssri-snri":             /\b(fluoxetine|sertraline|paroxetine|citalopram|escitalopram|venlafaxine|duloxetine)\b/i,
  "maoi":                  /\b(phenelzine|tranylcypromine|isocarboxazid|selegiline|moclobemide)\b/i,
  "alcohol":               /\b(alcohol|ethanol)\b/i,
};

function classifyDrug(name: string): DrugClass[] {
  const out: DrugClass[] = [];
  for (const [cls, re] of Object.entries(CLASS_PATTERNS) as [DrugClass, RegExp][]) {
    if (re.test(name)) out.push(cls);
  }
  return out;
}

interface InteractionRule {
  id: string;
  a: DrugClass;
  b: DrugClass;
  severity: GuardSeverity;     // danger = contraindicated/major; warning = moderate/minor
  level: "CONTRAINDICATED" | "MAJOR" | "MODERATE" | "MINOR";
  title: string;
  detail: string;
  recommendation: string;
}

/** Curated dermatology + common-comorbidity interactions. Derm
 *  references: BAD guidelines, AAD topic reviews. Comorbidity refs:
 *  Stockley, FDA labeling. Order doesn't matter — checkInteractions
 *  searches both directions. */
const INTERACTIONS: InteractionRule[] = [
  // ── Retinoid ↔ X ──────────────────────────────────────────
  {
    id: "iso-tetracycline",
    a: "isotretinoin", b: "tetracycline",
    severity: "danger", level: "CONTRAINDICATED",
    title: "Isotretinoin + Tetracycline class",
    detail: "Concomitant use raises the risk of pseudotumor cerebri (idiopathic intracranial hypertension).",
    recommendation: "Hold the tetracycline. Use an alternative (e.g. erythromycin, azithromycin) if antibacterial cover is still needed.",
  },
  {
    id: "iso-vitamin-a",
    a: "isotretinoin", b: "vitamin-a",
    severity: "danger", level: "MAJOR",
    title: "Isotretinoin + Vitamin A",
    detail: "Additive risk of hypervitaminosis A (mucocutaneous, hepatic, CNS toxicity).",
    recommendation: "Stop vitamin A supplements while on isotretinoin.",
  },
  {
    id: "iso-acitretin",
    a: "isotretinoin", b: "acitretin",
    severity: "danger", level: "CONTRAINDICATED",
    title: "Two systemic retinoids",
    detail: "Combining systemic retinoids massively raises teratogenicity and cumulative toxicity risks.",
    recommendation: "Do not co-prescribe systemic retinoids. Pick one.",
  },
  {
    id: "iso-ocp",
    a: "isotretinoin", b: "oral-contraceptive",
    severity: "warning", level: "MODERATE",
    title: "Isotretinoin + OCP — confirm second method",
    detail: "Microdosed progestin-only pills ('mini-pills') are not considered effective enough on their own during isotretinoin therapy.",
    recommendation: "Confirm two effective contraceptive methods (or one + abstinence) per iPLEDGE-style guidance.",
  },
  {
    id: "acitretin-tetracycline",
    a: "acitretin", b: "tetracycline",
    severity: "danger", level: "MAJOR",
    title: "Acitretin + Tetracycline class",
    detail: "Risk of pseudotumor cerebri (same mechanism as isotretinoin + tetracycline).",
    recommendation: "Avoid combination. Use a non-tetracycline antibiotic if needed.",
  },
  {
    id: "acitretin-mtx",
    a: "acitretin", b: "methotrexate",
    severity: "danger", level: "CONTRAINDICATED",
    title: "Acitretin + Methotrexate",
    detail: "Severe additive hepatotoxicity. AAD psoriasis guidelines flag this combination as contraindicated.",
    recommendation: "Do not co-prescribe. Switch one agent.",
  },
  {
    id: "acitretin-alcohol",
    a: "acitretin", b: "alcohol",
    severity: "danger", level: "MAJOR",
    title: "Acitretin + Alcohol — extends teratogenicity window",
    detail: "Alcohol esterifies acitretin to etretinate, which has a half-life measured in months. The 3-year pregnancy-avoidance window after stopping acitretin is grounded in this interaction.",
    recommendation: "Counsel strict alcohol abstinence during therapy and for the post-treatment window.",
  },

  // ── Methotrexate ↔ X ──────────────────────────────────────
  {
    id: "mtx-trimethoprim",
    a: "methotrexate", b: "trimethoprim-sulfa",
    severity: "danger", level: "CONTRAINDICATED",
    title: "Methotrexate + Trimethoprim/Sulfa",
    detail: "Trimethoprim is itself an antifolate; combination causes severe pancytopenia and has been fatal.",
    recommendation: "Do not co-prescribe. Pick a non-antifolate antibiotic (doxycycline, cephalosporin).",
  },
  {
    id: "mtx-nsaid",
    a: "methotrexate", b: "nsaid",
    severity: "danger", level: "MAJOR",
    title: "Methotrexate + NSAID",
    detail: "NSAIDs reduce renal MTX clearance — toxicity risk especially at higher MTX doses.",
    recommendation: "Avoid chronic NSAID at high MTX doses. For low-dose weekly MTX, monitor renal function and counsel against long NSAID courses.",
  },
  {
    id: "mtx-salicylate",
    a: "methotrexate", b: "salicylate",
    severity: "warning", level: "MODERATE",
    title: "Methotrexate + Aspirin",
    detail: "Salicylates displace MTX from albumin and reduce renal clearance.",
    recommendation: "Avoid high-dose aspirin. Low-dose cardiac aspirin generally tolerated with monitoring.",
  },

  // ── Cyclosporine ↔ X ──────────────────────────────────────
  {
    id: "cyclosporine-statin",
    a: "cyclosporine", b: "statin",
    severity: "danger", level: "MAJOR",
    title: "Cyclosporine + Statin",
    detail: "Cyclosporine sharply raises statin levels — risk of rhabdomyolysis, particularly with simvastatin and lovastatin.",
    recommendation: "If statin is needed, prefer pravastatin/rosuvastatin at the lowest effective dose with CK monitoring.",
  },
  {
    id: "cyclosporine-azole",
    a: "cyclosporine", b: "azole-antifungal",
    severity: "danger", level: "MAJOR",
    title: "Cyclosporine + Azole antifungal",
    detail: "Azoles inhibit CYP3A4 and raise cyclosporine levels — nephrotoxicity, hypertension.",
    recommendation: "Reduce cyclosporine dose ~50% and check trough levels within a week.",
  },
  {
    id: "cyclosporine-macrolide",
    a: "cyclosporine", b: "macrolide",
    severity: "danger", level: "MAJOR",
    title: "Cyclosporine + Macrolide",
    detail: "Erythromycin and clarithromycin inhibit CYP3A4 and raise cyclosporine levels.",
    recommendation: "Use azithromycin (lower interaction) or a non-macrolide where possible.",
  },
  {
    id: "cyclosporine-nsaid",
    a: "cyclosporine", b: "nsaid",
    severity: "danger", level: "MAJOR",
    title: "Cyclosporine + NSAID",
    detail: "Additive nephrotoxicity.",
    recommendation: "Avoid chronic NSAID. Prefer paracetamol or short courses with renal monitoring.",
  },

  // ── Warfarin ↔ X ──────────────────────────────────────────
  {
    id: "warfarin-tetracycline",
    a: "warfarin", b: "tetracycline",
    severity: "danger", level: "MAJOR",
    title: "Warfarin + Tetracycline",
    detail: "Tetracyclines reduce gut vitamin K-producing flora and may raise INR.",
    recommendation: "Recheck INR within 3-5 days of starting; adjust warfarin if needed.",
  },
  {
    id: "warfarin-trimethoprim",
    a: "warfarin", b: "trimethoprim-sulfa",
    severity: "danger", level: "MAJOR",
    title: "Warfarin + Trimethoprim/Sulfa",
    detail: "Strong CYP2C9 inhibition raises warfarin levels and INR.",
    recommendation: "Avoid combination if practical. Otherwise, recheck INR in 3 days and again at one week.",
  },
  {
    id: "warfarin-macrolide",
    a: "warfarin", b: "macrolide",
    severity: "warning", level: "MODERATE",
    title: "Warfarin + Macrolide",
    detail: "Erythromycin/clarithromycin inhibit CYP3A4; modest INR rise.",
    recommendation: "Recheck INR within a week of starting.",
  },
  {
    id: "warfarin-nsaid",
    a: "warfarin", b: "nsaid",
    severity: "danger", level: "MAJOR",
    title: "Warfarin + NSAID",
    detail: "Additive bleeding risk (platelet dysfunction + GI mucosal injury) on top of any INR effect.",
    recommendation: "Avoid combination. Use paracetamol for analgesia.",
  },

  // ── Spironolactone ↔ X ────────────────────────────────────
  {
    id: "spiro-acei",
    a: "spironolactone", b: "ace-inhibitor",
    severity: "danger", level: "MAJOR",
    title: "Spironolactone + ACEi/ARB",
    detail: "Both raise serum potassium — additive hyperkalemia, especially with renal impairment.",
    recommendation: "Check baseline K+ and creatinine; recheck within 1-2 weeks. Avoid in eGFR < 45.",
  },
  {
    id: "spiro-potassium",
    a: "spironolactone", b: "potassium-supplement",
    severity: "danger", level: "MAJOR",
    title: "Spironolactone + Potassium supplement",
    detail: "Direct additive hyperkalemia.",
    recommendation: "Stop the potassium supplement unless biochemistry justifies it under close monitoring.",
  },

  // ── Statin ↔ X (non-cyclosporine) ─────────────────────────
  {
    id: "statin-macrolide",
    a: "statin", b: "macrolide",
    severity: "danger", level: "MAJOR",
    title: "Statin + Macrolide (CYP3A4)",
    detail: "Erythromycin and clarithromycin sharply raise simvastatin/atorvastatin levels — rhabdomyolysis risk.",
    recommendation: "Hold simvastatin/atorvastatin during the course, or use azithromycin.",
  },
  {
    id: "statin-azole",
    a: "statin", b: "azole-antifungal",
    severity: "danger", level: "MAJOR",
    title: "Statin + Azole antifungal",
    detail: "CYP3A4 inhibition raises statin levels — rhabdomyolysis risk.",
    recommendation: "Hold the statin during a short antifungal course, or switch to a non-CYP3A4 statin (pravastatin/rosuvastatin).",
  },

  // ── QT prolongation ───────────────────────────────────────
  {
    id: "hcq-qt",
    a: "hydroxychloroquine", b: "qt-prolonging",
    severity: "danger", level: "MAJOR",
    title: "Hydroxychloroquine + QT-prolonging drug",
    detail: "Additive QT prolongation — torsades de pointes risk.",
    recommendation: "Get a baseline ECG. Avoid combination if QTc > 460 ms (men) / 470 ms (women) or with bradyarrhythmia.",
  },
  {
    id: "macrolide-qt",
    a: "macrolide", b: "qt-prolonging",
    severity: "warning", level: "MODERATE",
    title: "Macrolide + QT-prolonging drug",
    detail: "Erythromycin/clarithromycin themselves prolong QT.",
    recommendation: "Consider azithromycin (lower QT effect) or a non-macrolide.",
  },

  // ── Dapsone ───────────────────────────────────────────────
  {
    id: "dapsone-trimethoprim",
    a: "dapsone", b: "trimethoprim-sulfa",
    severity: "warning", level: "MODERATE",
    title: "Dapsone + Trimethoprim",
    detail: "Trimethoprim raises dapsone hydroxylamine metabolite — methemoglobinemia and hemolysis risk, especially in G6PD-deficient patients.",
    recommendation: "Confirm G6PD status before starting dapsone. Avoid combination in deficiency.",
  },

  // ── Tetracycline ↔ binders ────────────────────────────────
  {
    id: "tetracycline-antacid",
    a: "tetracycline", b: "antacid-iron-calcium",
    severity: "warning", level: "MODERATE",
    title: "Tetracycline + Antacid / Iron / Calcium",
    detail: "Polyvalent cations chelate the tetracycline — ~50-90% absorption loss.",
    recommendation: "Separate doses by ≥2 hours. Take the tetracycline first.",
  },

  // ── Topical pairs ─────────────────────────────────────────
  {
    id: "tretinoin-bpo",
    a: "topical-retinoid", b: "benzoyl-peroxide",
    severity: "warning", level: "MINOR",
    title: "Topical retinoid + Benzoyl peroxide",
    detail: "BPO can oxidize older tretinoin formulations and reduce effectiveness; both also amplify irritation.",
    recommendation: "Apply at different times of day (BPO AM, retinoid PM), or use a stable adapalene-BPO combination product.",
  },

  // ── Serotonergic ──────────────────────────────────────────
  {
    id: "ssri-maoi",
    a: "ssri-snri", b: "maoi",
    severity: "danger", level: "CONTRAINDICATED",
    title: "SSRI/SNRI + MAOI",
    detail: "Risk of serotonin syndrome — life-threatening.",
    recommendation: "Do not co-prescribe. Wait the appropriate washout (typically 14 days; 5 weeks for fluoxetine).",
  },

  // ── OCP efficacy ──────────────────────────────────────────
  {
    id: "tetracycline-ocp",
    a: "tetracycline", b: "oral-contraceptive",
    severity: "warning", level: "MINOR",
    title: "Tetracycline + Oral contraceptive",
    detail: "Theoretical reduction in OCP efficacy is debated; for most patients on stable OCP + tetracycline acne dose, modern guidance considers it minor.",
    recommendation: "Counsel a backup method during the antibiotic course if the patient relies on OCP alone.",
  },
];

function checkInteractions(newItems: string[], activeMeds: string[]): GuardWarning[] {
  // Pre-classify everything.
  const newClassified = newItems.map((n) => ({ name: n, classes: classifyDrug(n) }));
  const activeClassified = activeMeds.map((n) => ({ name: n, classes: classifyDrug(n) }));

  const allByClass: Map<DrugClass, Set<string>> = new Map();
  for (const item of [...newClassified, ...activeClassified]) {
    for (const c of item.classes) {
      const set = allByClass.get(c) || new Set<string>();
      set.add(item.name);
      allByClass.set(c, set);
    }
  }

  const warnings: GuardWarning[] = [];
  for (const rule of INTERACTIONS) {
    const aMatches = allByClass.get(rule.a);
    const bMatches = allByClass.get(rule.b);
    if (!aMatches || !bMatches) continue;
    // Skip self-pair if a == b and the same name matches both
    // (i.e. only one drug exists in this class on the form/profile).
    if (rule.a === rule.b && aMatches.size < 2) continue;

    // Require at least one match to be a NEW item — purely-existing
    // pairs are the patient's pre-existing reality, not something
    // the doctor is about to introduce.
    const newNames = new Set(newClassified.map((i) => i.name));
    const anyNew =
      [...aMatches].some((n) => newNames.has(n)) ||
      [...bMatches].some((n) => newNames.has(n));
    if (!anyNew) continue;

    const affected = Array.from(new Set([...aMatches, ...bMatches]));
    warnings.push({
      id: `interaction-${rule.id}`,
      severity: rule.severity,
      title: `${rule.level} — ${rule.title}`,
      detail: rule.detail,
      affectedItems: affected,
      recommendation: rule.recommendation,
    });
  }
  return warnings;
}

// Exported for tests / dev scripts.
export const __INTERACTIONS_FOR_TEST = INTERACTIONS;
export const __classifyForTest = classifyDrug;
