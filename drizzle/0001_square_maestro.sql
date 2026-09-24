CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor` text DEFAULT 'system' NOT NULL,
	`action` text NOT NULL,
	`resource` text NOT NULL,
	`result` text DEFAULT 'success' NOT NULL,
	`detail` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `privacy_policies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`purpose_code` text NOT NULL,
	`legal_basis` text NOT NULL,
	`minimum_fields` text DEFAULT '[]' NOT NULL,
	`retention_days` integer NOT NULL,
	`requires_explicit_consent` integer DEFAULT false NOT NULL,
	`requires_human_approval` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `privacy_policies_purpose_code_unique` ON `privacy_policies` (`purpose_code`);--> statement-breakpoint
CREATE TABLE `workflow_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_key` text NOT NULL,
	`ticket_reference` text,
	`rule_code` text NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`next_run_at` integer NOT NULL,
	`locked_at` integer,
	`last_error` text,
	`created_at` integer NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workflow_jobs_job_key_unique` ON `workflow_jobs` (`job_key`);