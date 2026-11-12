-- K9: yatış kararı → servise yerleşme sayacı (2 saat) ve acilde kalış sayacı (8 saat). Klinik kararın içeriği tutulmaz; yalnız verildiği zaman.
CREATE TABLE `simops_admissions` (`tenant` text NOT NULL, `id` text NOT NULL, `patient` text NOT NULL, `target_unit` text NOT NULL, `arrived_at` integer NOT NULL, `decided_at` integer NOT NULL, `placed_at` integer, `recorded_by` text NOT NULL, `version` integer NOT NULL DEFAULT 1, PRIMARY KEY(`tenant`,`id`));
--> statement-breakpoint
CREATE INDEX `simops_admissions_open` ON `simops_admissions` (`tenant`,`placed_at`);
