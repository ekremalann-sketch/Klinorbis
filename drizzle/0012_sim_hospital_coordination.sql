CREATE TABLE simops_members (tenant TEXT NOT NULL CHECK(tenant IN ('SIM-KURUM-A','SIM-KURUM-B')), email TEXT NOT NULL, PRIMARY KEY(tenant,email));
--> statement-breakpoint
CREATE TABLE simops_beds (tenant TEXT NOT NULL, id TEXT NOT NULL, campus TEXT NOT NULL, building TEXT NOT NULL, floor TEXT NOT NULL, unit TEXT NOT NULL, room TEXT NOT NULL, physical TEXT NOT NULL DEFAULT 'occupied' CHECK(physical IN ('occupied','departed','unknown')), hbys TEXT NOT NULL DEFAULT 'occupied' CHECK(hbys IN ('occupied','vacant','unknown')), cleaning TEXT NOT NULL DEFAULT 'dirty' CHECK(cleaning IN ('dirty','queued','active','check','ready')), technical INTEGER NOT NULL DEFAULT 1 CHECK(technical IN(0,1)), staffed INTEGER NOT NULL DEFAULT 1 CHECK(staffed IN(0,1)), review INTEGER NOT NULL DEFAULT 0 CHECK(review IN(0,1)), source_version INTEGER NOT NULL DEFAULT 0, observed_at INTEGER, version INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(tenant,id));
--> statement-breakpoint
CREATE TABLE simops_messages (tenant TEXT NOT NULL, id TEXT NOT NULL, bed TEXT NOT NULL, kind TEXT NOT NULL, source_version INTEGER NOT NULL, observed_at INTEGER NOT NULL, authority TEXT NOT NULL, hash TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN('processed','stale','quarantine','review')), code TEXT, task TEXT, attempts INTEGER NOT NULL DEFAULT 1, received_at INTEGER NOT NULL, PRIMARY KEY(tenant,id));
--> statement-breakpoint
CREATE TABLE simops_jobs (tenant TEXT NOT NULL, id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN('cleaning','transport','review')), bed TEXT NOT NULL, target TEXT, unit TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', owner TEXT, handoff_to TEXT, authority TEXT NOT NULL, patient TEXT, decision_at INTEGER, delivery_evidence TEXT, reason TEXT NOT NULL DEFAULT 'WAIT_ACCEPT', version INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(tenant,id), FOREIGN KEY(tenant,bed) REFERENCES simops_beds(tenant,id));
--> statement-breakpoint
CREATE UNIQUE INDEX simops_one_open_cleaning ON simops_jobs(tenant,bed) WHERE kind='cleaning' AND status NOT IN('done','cancelled');
--> statement-breakpoint
CREATE TABLE simops_reservations (tenant TEXT NOT NULL, bed TEXT NOT NULL, patient TEXT NOT NULL, job TEXT NOT NULL, PRIMARY KEY(tenant,bed), UNIQUE(tenant,patient), FOREIGN KEY(tenant,bed) REFERENCES simops_beds(tenant,id));
--> statement-breakpoint
CREATE TABLE simops_log (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, resource TEXT NOT NULL, at INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE simops_guard (id TEXT PRIMARY KEY, ok INTEGER NOT NULL CHECK(ok=1));
--> statement-breakpoint
CREATE INDEX simops_queue ON simops_jobs(tenant,status,unit,created_at);

--> statement-breakpoint
CREATE UNIQUE INDEX simops_one_active_transport ON simops_jobs(tenant,bed) WHERE kind='transport' AND status NOT IN('done','cancelled');

--> statement-breakpoint
CREATE TABLE simops_duty (tenant TEXT NOT NULL, email TEXT NOT NULL, unit TEXT NOT NULL, starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL CHECK(ends_at>starts_at), available INTEGER NOT NULL CHECK(available IN(0,1)), PRIMARY KEY(tenant,email,unit), FOREIGN KEY(tenant,email) REFERENCES simops_members(tenant,email));
