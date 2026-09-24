CREATE TABLE `capacity_snapshots` (
	`facility_code` text NOT NULL,
	`unit_code` text NOT NULL,
	`resource_code` text NOT NULL,
	`resource_label` text NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`occupied` integer DEFAULT 0 NOT NULL,
	`reserved` integer DEFAULT 0 NOT NULL,
	`blocked` integer DEFAULT 0 NOT NULL,
	`cleaning` integer DEFAULT 0 NOT NULL,
	`staffed` integer DEFAULT 0 NOT NULL,
	`discharge_forecast` integer DEFAULT 0 NOT NULL,
	`incoming` integer DEFAULT 0 NOT NULL,
	`outgoing` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'available' NOT NULL,
	`training` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`facility_code`, `unit_code`, `resource_code`)
);
--> statement-breakpoint
CREATE TABLE `facilities` (
	`code` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`campus_type` text NOT NULL,
	`city` text DEFAULT 'İzmir' NOT NULL,
	`status` text DEFAULT 'operational' NOT NULL,
	`total_beds` integer DEFAULT 0 NOT NULL,
	`training` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `facilities_name_unique` ON `facilities` (`name`);--> statement-breakpoint
CREATE TABLE `report_assignments` (
	`reference` text PRIMARY KEY NOT NULL,
	`report_code` text NOT NULL,
	`title` text NOT NULL,
	`scope_type` text DEFAULT 'network' NOT NULL,
	`facility_code` text,
	`unit_code` text,
	`assigned_role` text NOT NULL,
	`schedule` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`delivery` text DEFAULT 'dashboard' NOT NULL,
	`result_json` text DEFAULT '{}' NOT NULL,
	`training` integer DEFAULT true NOT NULL,
	`last_run_at` integer,
	`next_run_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `report_assignments_report_code_unique` ON `report_assignments` (`report_code`);--> statement-breakpoint
CREATE TABLE `staff_shifts` (
	`reference` text PRIMARY KEY NOT NULL,
	`staff_label` text NOT NULL,
	`facility_code` text NOT NULL,
	`unit_code` text NOT NULL,
	`role` text NOT NULL,
	`shift_code` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`handoff_to` text,
	`training` integer DEFAULT true NOT NULL,
	`started_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transfer_requests` (
	`reference` text PRIMARY KEY NOT NULL,
	`patient_alias` text NOT NULL,
	`source_facility_code` text NOT NULL,
	`target_facility_code` text NOT NULL,
	`requested_unit_code` text NOT NULL,
	`resource_code` text NOT NULL,
	`resource_label` text NOT NULL,
	`requested_count` integer DEFAULT 1 NOT NULL,
	`priority` text DEFAULT 'Normal' NOT NULL,
	`status` text DEFAULT 'received' NOT NULL,
	`decision_code` text,
	`decision_detail` text,
	`alternatives` text DEFAULT '[]' NOT NULL,
	`ticket_reference` text,
	`training` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`decided_at` integer,
	`updated_at` integer NOT NULL
);
