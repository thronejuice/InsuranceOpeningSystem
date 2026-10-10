-- Migration: 20261010110000_endorsement_approver_role
-- Day 46 (security review) — remember which role the approval rule demanded when the endorsement was submitted,
-- so approve / reject can enforce it (before, any user with policy.update could approve a MANAGER-level endorsement).
ALTER TABLE "endorsements" ADD COLUMN IF NOT EXISTS "required_approver_role" TEXT;
