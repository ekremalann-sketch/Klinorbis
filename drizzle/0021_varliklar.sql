-- KG1 (adım 1): varlık (cihaz/ekipman) kaydı. Biyomedikal ve teknik varlıklar tek tabloda; bakım ve kalibrasyon
-- vadesi kayıttan hesaplanır. Klinik bilgi tutulmaz. Bulut demoda yalnız kurgusal seri numaraları kullanılır.
CREATE TABLE `assets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`category` text,
	`brand` text,
	`model` text,
	`serial` text,
	`owner_type` text DEFAULT 'hastane' NOT NULL,
	`unit_code` text NOT NULL,
	`location` text,
	`status` text DEFAULT 'aktif' NOT NULL,
	`maintenance_interval_days` integer,
	`calibration_interval_days` integer,
	`last_maintenance_at` integer,
	`last_calibration_at` integer,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assets_code` ON `assets` (`code`);
--> statement-breakpoint
CREATE INDEX `assets_unit_status` ON `assets` (`unit_code`,`status`);
