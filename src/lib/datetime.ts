// Centralised date/time formatting.
//
// Every reminder time is stored as UTC (a `timestamptz` column, written with
// `Date.toISOString()`), so a given reminder is a single absolute instant. We
// render it in the *viewer's* local timezone and always append the timezone
// abbreviation — that way two people in different zones can see at a glance that
// a time is shown in their own local zone (and not mistake it for a bug when the
// numbers differ between them).

export function formatDateTime(value: Date | string): string {
  const d = typeof value === 'string' ? new Date(value) : value
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}
