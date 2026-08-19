-- Split out of what was originally one migration (20260721193626 set the
-- precedent for extending app_role, and that happened to not hit this —
-- but Postgres genuinely cannot use a freshly ADD VALUE'd enum label
-- inside the same transaction that added it: "unsafe use of new value
-- ... New enum values must be committed before they can be used."
-- Confirmed hitting this live when relaying the original combined
-- migration). This file does ONLY the enum extension, alone, so it
-- commits on its own before 20260819121500 (which references 'teacher'
-- in RLS policies) runs as a separate statement/transaction.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'teacher';
