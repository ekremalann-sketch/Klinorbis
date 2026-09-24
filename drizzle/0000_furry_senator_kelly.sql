CREATE TABLE `automation_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticket_reference` text NOT NULL,
	`rule` text NOT NULL,
	`outcome` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tickets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reference` text NOT NULL,
	`patient_alias` text NOT NULL,
	`subject` text NOT NULL,
	`unit` text NOT NULL,
	`priority` text DEFAULT 'Normal' NOT NULL,
	`status` text DEFAULT 'Yeni' NOT NULL,
	`channel` text DEFAULT 'Web' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tickets_reference_unique` ON `tickets` (`reference`);