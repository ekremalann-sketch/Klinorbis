CREATE TABLE `shift_handoffs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`unit_code` text NOT NULL,
	`from_email` text NOT NULL,
	`to_email` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`open_tickets` integer DEFAULT 0 NOT NULL,
	`open_tasks` integer DEFAULT 0 NOT NULL,
	`moved_tickets` integer DEFAULT 0 NOT NULL,
	`moved_tasks` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`decided_at` integer,
	`decided_by` text
);
--> statement-breakpoint
CREATE INDEX `shift_handoffs_unit_status` ON `shift_handoffs` (`unit_code`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `shift_handoffs_one_pending` ON `shift_handoffs` (`from_email`,`unit_code`) WHERE status = 'pending';