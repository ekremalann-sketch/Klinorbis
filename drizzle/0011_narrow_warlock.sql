CREATE TABLE `simulation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`seed` integer NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`params` text NOT NULL,
	`result` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `staff_notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`detail` text NOT NULL,
	`path` text DEFAULT '/inbox' NOT NULL,
	`dedupe_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`read_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `staff_notifications_dedupe_key_unique` ON `staff_notifications` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `staff_notifications_inbox` ON `staff_notifications` (`email`,`read_at`,`created_at`);--> statement-breakpoint
ALTER TABLE `operational_tasks` ADD `escalation_level` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `operational_tasks` ADD `escalated_at` integer;--> statement-breakpoint
CREATE INDEX `operational_tasks_overdue` ON `operational_tasks` (`status`,`due_at`);--> statement-breakpoint
ALTER TABLE `playbook_runs` ADD `campus` text;--> statement-breakpoint
ALTER TABLE `playbook_runs` ADD `location` text;--> statement-breakpoint
ALTER TABLE `playbook_runs` ADD `device_code` text;--> statement-breakpoint
ALTER TABLE `playbook_runs` ADD `patient_ref` text;--> statement-breakpoint
ALTER TABLE `playbook_runs` ADD `chain_choices` text;