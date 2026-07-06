// Shared logic for the "send reminder" countdown, used on both Home (where you
// send reminders) and anywhere else a due-time is shown.

export const OVERDUE_GRACE_MS = 60_000

export type DuePhase = 'waiting' | 'due' | 'overdue'

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

// Countdown string that drops leading zero-units as time runs out:
// "2d 4h 13m 50s" -> "4h 13m 50s" -> "13m 50s" -> "50s"
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (d > 0) return `${d}d ${h}h ${m}m ${sec}s`
  if (h > 0) return `${h}h ${m}m ${sec}s`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}

// Next reminder is due at the scheduled time plus one interval per reminder
// already sent. All math is on absolute UTC milliseconds, so it's timezone-safe.
export function reminderDueAt(
  scheduledAtISO: string,
  intervalMinutes: number | null,
  remindersSent: number,
): number {
  return new Date(scheduledAtISO).getTime() + (intervalMinutes ?? 0) * 60_000 * remindersSent
}

export function duePhase(dueAt: number, now: number): DuePhase {
  const remaining = dueAt - now
  if (remaining > 0) return 'waiting'
  return now - dueAt < OVERDUE_GRACE_MS ? 'due' : 'overdue'
}
