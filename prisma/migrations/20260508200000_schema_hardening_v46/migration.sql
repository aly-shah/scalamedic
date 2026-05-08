-- v46 — Schema hardening: revocation invariants + petty cash gaps
-- =================================================================
-- Three small but real gaps:
--
--   1. revoked_sessions.expiresAt > revokedAt — a JWT "expiring
--      before it was revoked" indicates clock skew or a tampered
--      row; either way the revocation lookup result becomes
--      meaningless.
--
--   2. petty_cash_expenses.description was VARCHAR(200) NOT NULL but
--      had no trim-empty guard. A whitespace-only "ghost" entry
--      would pass NOT NULL and appear blank on every till sheet.
--
--   3. petty_cash_expenses.date should not be in the future —
--      logging tomorrow's expense today is always a typo. Mirrors
--      patient_packages_purchase_not_future from earlier hardening.
--
--   4. petty_cash_expenses.paidTo / notes — same blank-ghost guard
--      as the rest of the schema (matches the _nonempty pattern
--      every other text field uses).
--
-- Pre-flight on production: 0 violators across all 5 proposed
-- constraints.

ALTER TABLE revoked_sessions
  ADD CONSTRAINT revoked_sessions_expiresAt_after_revoked
    CHECK ("expiresAt" > "revokedAt");

ALTER TABLE petty_cash_expenses
  ADD CONSTRAINT petty_cash_expenses_description_nonempty
    CHECK (length(trim(description)) > 0),
  ADD CONSTRAINT petty_cash_expenses_date_not_future
    CHECK (date <= CURRENT_DATE),
  ADD CONSTRAINT petty_cash_expenses_paidTo_nonempty
    CHECK ("paidTo" IS NULL OR length(trim("paidTo")) > 0),
  ADD CONSTRAINT petty_cash_expenses_notes_nonempty
    CHECK (notes IS NULL OR length(trim(notes)) > 0);
