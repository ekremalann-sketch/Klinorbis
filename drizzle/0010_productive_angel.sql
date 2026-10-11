ALTER TABLE `playbook_runs` ADD `trigger_event` text;--> statement-breakpoint
CREATE UNIQUE INDEX `playbook_runs_trigger_once` ON `playbook_runs` (`trigger_event`) WHERE trigger_event is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `playbook_runs_chain_once` ON `playbook_runs` (`parent_reference`,`playbook_code`) WHERE parent_reference is not null;--> statement-breakpoint
ALTER TABLE `playbook_steps` ADD `activate_at` integer;--> statement-breakpoint
ALTER TABLE `playbook_steps` ADD `due_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `appointment_changes_slot_once` ON `appointment_changes` (`proposed_physician_code`,`proposed_starts_at`) WHERE proposed_starts_at is not null and status in ('proposed','offered','accepted');