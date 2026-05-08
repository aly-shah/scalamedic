-- v10: freeform reason/link fields → TEXT
--
-- Three fields hold user-generated freeform text but were typed as VARCHAR
-- with tight limits. Changing to TEXT: no storage cost difference, no
-- truncation risk on legitimate long inputs, consistent with other
-- freeform fields (notes, cancellationNote, bio, etc.) already on TEXT.

ALTER TABLE "follow_ups" ALTER COLUMN "reason" TYPE TEXT;
ALTER TABLE "blocked_slots" ALTER COLUMN "reason" TYPE TEXT;
ALTER TABLE "notifications" ALTER COLUMN "link" TYPE TEXT;
