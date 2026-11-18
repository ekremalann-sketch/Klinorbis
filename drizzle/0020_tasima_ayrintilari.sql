-- Çözüm Mimarı K6: taşıma talebinde taşıma şekli, izolasyon bayrağı, planlı/acil; "hasta alındı" zamanı ve gecikme nedeni. Yalnız sütun ekleme.
ALTER TABLE `simops_jobs` ADD COLUMN `transport_mode` text;
--> statement-breakpoint
ALTER TABLE `simops_jobs` ADD COLUMN `isolation` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `simops_jobs` ADD COLUMN `urgency` text NOT NULL DEFAULT 'planli';
--> statement-breakpoint
ALTER TABLE `simops_jobs` ADD COLUMN `picked_at` integer;
--> statement-breakpoint
ALTER TABLE `simops_jobs` ADD COLUMN `delay_reason` text;
