/** Lesson 3.3: write one row to the audit log (never blocks the real action if it fails) */
import type { Db } from '../db/client'
import { auditLog } from '../db/schema'

export async function audit(db: Db, actorId: string | null, action: string, targetType: string,
  targetId: string | null, details?: Record<string, unknown>) {
  try {
    await db.insert(auditLog).values({ actorId, action, targetType, targetId, details })
  } catch (err) {
    console.error('audit log failed', action, err)
  }
}
