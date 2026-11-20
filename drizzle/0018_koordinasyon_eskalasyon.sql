-- K7: koordinasyon işlerinde (temizlik, taşıma, inceleme) gecikme yükseltme seviyesi. Yalnız yeni sütun.
ALTER TABLE `simops_jobs` ADD COLUMN `escalation_level` integer NOT NULL DEFAULT 0;
