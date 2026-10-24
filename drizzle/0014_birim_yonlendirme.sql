CREATE TABLE `routing_rules` (
	`request_code` text PRIMARY KEY NOT NULL,
	`unit_code` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `service_requests` (
	`reference` text PRIMARY KEY NOT NULL,
	`type_code` text NOT NULL,
	`unit_code` text NOT NULL,
	`task_reference` text NOT NULL,
	`requester_email` text NOT NULL,
	`requester_unit` text,
	`location` text,
	`target_location` text,
	`device_code` text,
	`note` text,
	`status` text DEFAULT 'open' NOT NULL,
	`reopened_from` text,
	`created_at` integer NOT NULL,
	`done_at` integer,
	`confirmed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `service_requests_task_reference_unique` ON `service_requests` (`task_reference`);--> statement-breakpoint
CREATE INDEX `service_requests_requester` ON `service_requests` (`requester_email`,`status`);--> statement-breakpoint
CREATE INDEX `service_requests_unit` ON `service_requests` (`unit_code`,`status`);