-- Migration: 20261010120000_policy_cancel_requester
-- Security review: remember who asked for a policy cancellation so the approver cannot be the same person (maker-checker).
ALTER TABLE "policies" ADD COLUMN IF NOT EXISTS "cancel_requested_by_id" UUID;
