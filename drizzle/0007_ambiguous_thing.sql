CREATE TABLE `appointment_changes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`absence_reference` text NOT NULL,
	`appointment_reference` text NOT NULL,
	`option` text NOT NULL,
	`proposed_physician_code` text,
	`proposed_facility_code` text,
	`proposed_starts_at` integer,
	`reason` text NOT NULL,
	`status` text DEFAULT 'proposed' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`responded_by` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `appointment_changes_once` ON `appointment_changes` (`absence_reference`,`appointment_reference`);--> statement-breakpoint
CREATE TABLE `appointments` (
	`reference` text PRIMARY KEY NOT NULL,
	`patient_alias` text NOT NULL,
	`physician_code` text NOT NULL,
	`unit_code` text NOT NULL,
	`facility_code` text NOT NULL,
	`starts_at` integer NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`clinical_priority` integer DEFAULT false NOT NULL,
	`allow_other_physician` integer DEFAULT false NOT NULL,
	`preferred_channel` text,
	`consent_channels` text DEFAULT '[]' NOT NULL,
	`contact_masked` text,
	`source` text DEFAULT 'HBYS' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`training` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `appointments_physician_day` ON `appointments` (`physician_code`,`starts_at`);--> statement-breakpoint
CREATE INDEX `appointments_unit_status` ON `appointments` (`unit_code`,`status`);--> statement-breakpoint
CREATE TABLE `patient_notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reference` text NOT NULL,
	`appointment_reference` text,
	`ticket_reference` text,
	`patient_alias` text NOT NULL,
	`channel` text NOT NULL,
	`template` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`provider` text DEFAULT 'not_configured' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`send_after` integer NOT NULL,
	`sent_at` integer,
	`last_error` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `patient_notifications_reference_unique` ON `patient_notifications` (`reference`);--> statement-breakpoint
CREATE INDEX `patient_notifications_status` ON `patient_notifications` (`status`,`send_after`);--> statement-breakpoint
CREATE TABLE `physician_absences` (
	`reference` text PRIMARY KEY NOT NULL,
	`physician_code` text NOT NULL,
	`unit_code` text NOT NULL,
	`day` text NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`affected_count` integer DEFAULT 0 NOT NULL,
	`reported_by` text NOT NULL,
	`decided_by` text,
	`created_at` integer NOT NULL,
	`decided_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `physician_absences_open` ON `physician_absences` (`physician_code`,`day`) WHERE status in ('planned','approved');--> statement-breakpoint
CREATE TABLE `physicians` (
	`code` text PRIMARY KEY NOT NULL,
	`display_label` text NOT NULL,
	`unit_code` text NOT NULL,
	`facility_code` text NOT NULL,
	`daily_capacity` integer DEFAULT 20 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`training` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `physicians_unit` ON `physicians` (`unit_code`,`facility_code`);