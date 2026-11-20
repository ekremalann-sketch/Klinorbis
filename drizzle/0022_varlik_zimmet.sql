-- KG1 (adım 2): zimmet. Yönetici varlığı bir personele zimmetler; personel kendi oturumuyla telefonda onaylar (imza).
-- Bir varlığın aynı anda tek açık zimmeti olur. İade ile kapanır; kayıt silinmez.
CREATE TABLE `asset_custody` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`asset_code` text NOT NULL,
	`holder_email` text NOT NULL,
	`given_by` text NOT NULL,
	`given_at` integer NOT NULL,
	`accepted_at` integer,
	`receipt` text,
	`returned_at` integer,
	`returned_by` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `asset_custody_open` ON `asset_custody` (`asset_code`) WHERE `returned_at` IS NULL;
--> statement-breakpoint
CREATE INDEX `asset_custody_holder` ON `asset_custody` (`holder_email`,`returned_at`);
