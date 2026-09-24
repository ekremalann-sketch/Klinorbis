ALTER TABLE `audit_logs` ADD `previous_hash` text DEFAULT 'GENESIS' NOT NULL;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD `current_hash` text DEFAULT 'LEGACY' NOT NULL;--> statement-breakpoint
ALTER TABLE `tickets` ADD `masked_subject` text;--> statement-breakpoint
ALTER TABLE `tickets` ADD `detected_pii` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `tickets` ADD `urgency_level` integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE `tickets` ADD `human_approval_required` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `workflow_jobs` ADD `idempotency_key` text;--> statement-breakpoint
ALTER TABLE `workflow_jobs` ADD `correlation_id` text;--> statement-breakpoint
ALTER TABLE `workflow_jobs` ADD `locked_by` text;--> statement-breakpoint
UPDATE `workflow_jobs` SET `idempotency_key`=`job_key`, `correlation_id`='legacy-' || `id` WHERE `idempotency_key` IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `workflow_jobs_idempotency_key_unique` ON `workflow_jobs` (`idempotency_key`);
