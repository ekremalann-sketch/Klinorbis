-- K8: ekran kapalıyken telefon bildirimi (web push). Bildirimin içeriği push servisinden geçmez;
-- telefon yalnız "yeni bildirim var" sinyali alır ve başlığı oturumla uygulamadan okur.
CREATE TABLE `push_subscriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`endpoint` text NOT NULL,
	`last_notified_id` integer DEFAULT 0 NOT NULL,
	`failures` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`last_sent_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint` ON `push_subscriptions` (`endpoint`);
--> statement-breakpoint
CREATE INDEX `push_subscriptions_email` ON `push_subscriptions` (`email`);
