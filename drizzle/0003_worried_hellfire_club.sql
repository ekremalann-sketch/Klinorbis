CREATE TABLE `approvals` (
	`reference` text PRIMARY KEY NOT NULL,
	`ticket_reference` text,
	`call_reference` text,
	`unit_code` text NOT NULL,
	`approval_type` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`requested_by` text NOT NULL,
	`decided_by` text,
	`decision_note` text,
	`created_at` integer NOT NULL,
	`decided_at` integer
);
--> statement-breakpoint
CREATE TABLE `call_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`call_reference` text NOT NULL,
	`sequence` integer NOT NULL,
	`speaker_type` text NOT NULL,
	`speaker_label` text NOT NULL,
	`message` text NOT NULL,
	`redacted` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `call_messages_call_sequence_unique` ON `call_messages` (`call_reference`,`sequence`);--> statement-breakpoint
CREATE TABLE `call_sessions` (
	`reference` text PRIMARY KEY NOT NULL,
	`patient_alias` text NOT NULL,
	`source` text NOT NULL,
	`direction` text DEFAULT 'Gelen' NOT NULL,
	`status` text DEFAULT 'ringing' NOT NULL,
	`unit_code` text DEFAULT 'CAG' NOT NULL,
	`assigned_role` text DEFAULT 'Çağrı Merkezi Görevlisi' NOT NULL,
	`summary` text,
	`training` integer DEFAULT false NOT NULL,
	`requires_human` integer DEFAULT false NOT NULL,
	`started_at` integer NOT NULL,
	`last_message_at` integer NOT NULL,
	`ended_at` integer
);
--> statement-breakpoint
CREATE TABLE `hospital_units` (
	`code` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`scope` text NOT NULL,
	`sla_minutes` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hospital_units_name_unique` ON `hospital_units` (`name`);--> statement-breakpoint
CREATE TABLE `integration_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`event_type` text NOT NULL,
	`payload_hash` text NOT NULL,
	`status` text DEFAULT 'accepted' NOT NULL,
	`received_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `operational_tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reference` text NOT NULL,
	`ticket_reference` text,
	`call_reference` text,
	`unit_code` text NOT NULL,
	`assigned_role` text NOT NULL,
	`assigned_user` text,
	`source_type` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`priority` text DEFAULT 'Normal' NOT NULL,
	`due_at` integer,
	`accepted_by` text,
	`accepted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `operational_tasks_reference_unique` ON `operational_tasks` (`reference`);--> statement-breakpoint
CREATE TABLE `rate_limit_counters` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `security_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_id` text NOT NULL,
	`event_type` text NOT NULL,
	`severity` text NOT NULL,
	`actor` text DEFAULT 'anonymous' NOT NULL,
	`ip_hash` text,
	`path` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `staff_accounts` (
	`email` text PRIMARY KEY NOT NULL,
	`display_label` text DEFAULT 'Yetkili Kullanıcı' NOT NULL,
	`system_role` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer
);
--> statement-breakpoint
CREATE TABLE `ticket_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticket_reference` text NOT NULL,
	`event_type` text NOT NULL,
	`actor` text NOT NULL,
	`from_unit_code` text,
	`to_unit_code` text,
	`detail` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `unit_memberships` (
	`email` text NOT NULL,
	`unit_code` text NOT NULL,
	`unit_role` text DEFAULT 'Birim Görevlisi' NOT NULL,
	`can_manage_tickets` integer DEFAULT false NOT NULL,
	`can_read_calls` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	PRIMARY KEY(`email`, `unit_code`)
);
--> statement-breakpoint
ALTER TABLE `automation_events` ADD `unit_code` text;--> statement-breakpoint
ALTER TABLE `automation_events` ADD `event_type` text DEFAULT 'workflow' NOT NULL;--> statement-breakpoint
ALTER TABLE `automation_events` ADD `actor` text DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE `tickets` ADD `unit_code` text DEFAULT 'HIL' NOT NULL;--> statement-breakpoint
ALTER TABLE `tickets` ADD `previous_unit_code` text;--> statement-breakpoint
ALTER TABLE `tickets` ADD `assigned_role` text DEFAULT 'Birim Görevlisi' NOT NULL;--> statement-breakpoint
ALTER TABLE `tickets` ADD `accepted_by` text;--> statement-breakpoint
ALTER TABLE `tickets` ADD `accepted_at` integer;--> statement-breakpoint
ALTER TABLE `tickets` ADD `updated_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `tickets` SET `updated_at`=`created_at` WHERE `updated_at`=0;--> statement-breakpoint
ALTER TABLE `tickets` ADD `sla_due_at` integer;
