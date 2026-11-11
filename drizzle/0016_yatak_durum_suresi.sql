-- K5: yatak panosu "bu durumda kaç dakikadır" sayacı. Yalnız yeni sütun ve tetikleyici; eski tablolar değişmez.
ALTER TABLE `simops_beds` ADD COLUMN `state_since` integer;
--> statement-breakpoint
UPDATE `simops_beds` SET `state_since` = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER) WHERE `state_since` IS NULL;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `simops_beds_state_since_insert` AFTER INSERT ON `simops_beds` WHEN NEW.`state_since` IS NULL
BEGIN
  UPDATE `simops_beds` SET `state_since` = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER) WHERE `tenant` = NEW.`tenant` AND `id` = NEW.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `simops_beds_state_since_update` AFTER UPDATE OF `physical`, `hbys`, `cleaning`, `technical`, `staffed`, `review` ON `simops_beds`
WHEN OLD.`physical` IS NOT NEW.`physical` OR OLD.`hbys` IS NOT NEW.`hbys` OR OLD.`cleaning` IS NOT NEW.`cleaning`
  OR OLD.`technical` IS NOT NEW.`technical` OR OLD.`staffed` IS NOT NEW.`staffed` OR OLD.`review` IS NOT NEW.`review`
BEGIN
  UPDATE `simops_beds` SET `state_since` = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER) WHERE `tenant` = NEW.`tenant` AND `id` = NEW.`id`;
END;
