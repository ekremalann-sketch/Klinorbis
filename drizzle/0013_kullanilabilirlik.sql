CREATE TABLE `cleaning_inspections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_reference` text NOT NULL,
	`step_index` integer NOT NULL,
	`cleaning_task_reference` text NOT NULL,
	`inspection_task_reference` text NOT NULL,
	`cleaned_by` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`inspector_email` text,
	`reason` text,
	`created_at` integer NOT NULL,
	`decided_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cleaning_inspections_inspection_task_reference_unique` ON `cleaning_inspections` (`inspection_task_reference`);--> statement-breakpoint
CREATE UNIQUE INDEX `cleaning_inspections_one_pending` ON `cleaning_inspections` (`run_reference`,`step_index`) WHERE status = 'pending';--> statement-breakpoint
CREATE TABLE `fault_reports` (
	`reference` text PRIMARY KEY NOT NULL,
	`run_reference` text NOT NULL,
	`category` text NOT NULL,
	`reporter_email` text NOT NULL,
	`reporter_unit` text,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL,
	`resolved_at` integer,
	`confirmed_at` integer,
	`reopened_run_reference` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fault_reports_run_reference_unique` ON `fault_reports` (`run_reference`);--> statement-breakpoint
CREATE INDEX `fault_reports_reporter` ON `fault_reports` (`reporter_email`,`status`);--> statement-breakpoint
CREATE TABLE `task_handoffs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_reference` text NOT NULL,
	`from_email` text NOT NULL,
	`to_email` text NOT NULL,
	`note` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`decided_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_handoffs_one_pending` ON `task_handoffs` (`task_reference`) WHERE status = 'pending';--> statement-breakpoint
ALTER TABLE `operational_tasks` ADD `title` text;--> statement-breakpoint
ALTER TABLE `operational_tasks` ADD `location` text;--> statement-breakpoint
ALTER TABLE `operational_tasks` ADD `started_at` integer;--> statement-breakpoint
ALTER TABLE `operational_tasks` ADD `blocked_reason` text;--> statement-breakpoint
ALTER TABLE `operational_tasks` ADD `blocked_at` integer;--> statement-breakpoint
ALTER TABLE `operational_tasks` ADD `help_requested_at` integer;--> statement-breakpoint
CREATE INDEX `operational_tasks_assignee` ON `operational_tasks` (`assigned_user`,`status`);--> statement-breakpoint
ALTER TABLE `playbook_runs` ADD `target_location` text;--> statement-breakpoint
ALTER TABLE `staff_shifts` ADD `staff_email` text;