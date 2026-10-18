// Test girişi: aynı paket içinde veritabanı ve yükseltme işlevi.
import { getDb } from "../../db";
import { escalateOverdueTasks } from "../../lib/escalation";
export const escalate = (minutesFromNow = 0) => escalateOverdueTasks(getDb(), new Date(Date.now() + minutesFromNow * 60000));
