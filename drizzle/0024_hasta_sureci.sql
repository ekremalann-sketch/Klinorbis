-- Hasta süreç takibi (başvurudan çıkışa). Ad, kimlik no veya klinik bilgi tutulmaz; hasta takma adı ve
-- takip kodunun özeti saklanır. PIN yalnız anahtarlı özet olarak tutulur. Eski tablolara dokunulmaz.
CREATE TABLE `patient_journeys` (
	`reference` text PRIMARY KEY NOT NULL,
	`tracking_hash` text NOT NULL,
	`pin_hash` text NOT NULL,
	`pathway` text NOT NULL,
	`clinic_unit` text NOT NULL,
	`patient_alias` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`current_seq` integer DEFAULT 1 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`failed_attempts` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`closed_at` integer,
	`close_reason` text,
	`lock_token` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `patient_journeys_tracking_hash_unique` ON `patient_journeys` (`tracking_hash`);
--> statement-breakpoint
CREATE INDEX `patient_journeys_status` ON `patient_journeys` (`status`,`updated_at`);
--> statement-breakpoint
CREATE TABLE `patient_journey_steps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`journey_reference` text NOT NULL,
	`seq` integer NOT NULL,
	`unit_code` text NOT NULL,
	`label` text NOT NULL,
	`kind` text DEFAULT 'path' NOT NULL,
	`optional` integer DEFAULT false NOT NULL,
	`reject_to` text,
	`reject_label` text,
	`state` text DEFAULT 'pending' NOT NULL,
	`entered_at` integer,
	`started_at` integer,
	`finished_at` integer,
	`actor` text,
	`note` text
);
--> statement-breakpoint
CREATE INDEX `patient_journey_steps_journey` ON `patient_journey_steps` (`journey_reference`,`seq`);
--> statement-breakpoint
CREATE INDEX `patient_journey_steps_unit` ON `patient_journey_steps` (`unit_code`,`state`,`entered_at`);
--> statement-breakpoint
CREATE TABLE `patient_journey_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`journey_reference` text NOT NULL,
	`action` text NOT NULL,
	`unit_code` text,
	`actor` text NOT NULL,
	`note` text,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `patient_journey_events_journey` ON `patient_journey_events` (`journey_reference`,`at`);
--> statement-breakpoint
CREATE TABLE `institution_inquiries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reference` text NOT NULL,
	`institution` text NOT NULL,
	`contact_name` text NOT NULL,
	`title` text,
	`email` text NOT NULL,
	`phone` text,
	`institution_type` text NOT NULL,
	`bed_count` text,
	`message` text,
	`status` text DEFAULT 'new' NOT NULL,
	`created_at` integer NOT NULL,
	`handled_by` text,
	`handled_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `institution_inquiries_reference_unique` ON `institution_inquiries` (`reference`);
--> statement-breakpoint
CREATE INDEX `institution_inquiries_status` ON `institution_inquiries` (`status`,`created_at`);
