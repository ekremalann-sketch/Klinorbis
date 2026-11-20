-- KG2: renkli kodlar (SKS KAD). Çağrı → onay → varış → kapanış zamanları ve olay kaydı. Tatbikat ayrı işaretlenir.
-- Mavi kod yalnız lojistiktir: ekibi çağırır, süreleri kaydeder; tıbbi müdahaleye yön vermez. Hasta bilgisi tutulmaz.
CREATE TABLE `emergency_codes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reference` text NOT NULL,
	`color` text NOT NULL,
	`location` text NOT NULL,
	`drill` integer DEFAULT 0 NOT NULL,
	`called_by` text NOT NULL,
	`called_at` integer NOT NULL,
	`acked_by` text,
	`acked_at` integer,
	`arrived_by` text,
	`arrived_at` integer,
	`closed_by` text,
	`closed_at` integer,
	`close_note` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `emergency_codes_reference` ON `emergency_codes` (`reference`);
--> statement-breakpoint
CREATE INDEX `emergency_codes_open` ON `emergency_codes` (`closed_at`,`called_at`);
