CREATE TABLE `playbook_runs` (
	`reference` text PRIMARY KEY NOT NULL,
	`playbook_code` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`current_step` integer DEFAULT 0 NOT NULL,
	`step_count` integer NOT NULL,
	`note` text,
	`parent_reference` text,
	`started_by` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`closed_at` integer
);
--> statement-breakpoint
CREATE TABLE `playbook_steps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_reference` text NOT NULL,
	`step_index` integer NOT NULL,
	`unit_code` text NOT NULL,
	`task` text NOT NULL,
	`approval` integer DEFAULT false NOT NULL,
	`task_reference` text NOT NULL,
	`completed_by` text,
	`note` text,
	`started_at` integer NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `playbook_steps_once` ON `playbook_steps` (`run_reference`,`step_index`);