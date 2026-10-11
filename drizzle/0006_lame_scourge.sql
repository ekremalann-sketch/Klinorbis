CREATE TABLE `patient_coordination` (
	`ticket_reference` text PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`state` text DEFAULT 'assessment' NOT NULL,
	`provider_alias` text DEFAULT '' NOT NULL,
	`availability` text DEFAULT 'unconfirmed' NOT NULL,
	`planned_at` text DEFAULT '' NOT NULL,
	`alternative` text DEFAULT '' NOT NULL,
	`contact_channel` text DEFAULT 'Telefon' NOT NULL,
	`notification_status` text DEFAULT 'pending' NOT NULL,
	`requested_by` text NOT NULL,
	`approved_by` text,
	`history` text DEFAULT '[]' NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`ticket_reference`) REFERENCES `tickets`(`reference`) ON UPDATE no action ON DELETE no action
);
