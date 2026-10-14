/**
 * ASTROLABE — ICS calendar export helper
 *
 * Generates a valid iCalendar (.ics) string from a list of events.
 * Each event becomes a VEVENT with SUMMARY, DTSTART, DTEND (start + 1h),
 * and DESCRIPTION. Used by the Today screen's "Add to calendar" button
 * so an employee can drop their upcoming dated steps into Outlook /
 * Google Calendar / Apple Calendar.
 *
 * RFC 5545 compliant: CRLF line endings, escaped text fields, UTC dates.
 */

export interface IcsEvent {
  /** Event title — shown as the calendar entry name. */
  summary: string;
  /** Start date/time as an ISO 8601 string (e.g. "2024-10-25T10:00:00Z"). */
  dtStart: string;
  /** Free-form description (owner + policy ref, etc.). */
  description: string;
}

/**
 * Escape ICS text per RFC 5545 §3.3.11:
 * backslash, semicolon, comma, and newline must be escaped.
 */
function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Format a Date as a UTC ICS date-time: YYYYMMDDTHHMMSSZ
 * (e.g. 20241025T100000Z). The trailing Z signals UTC.
 */
function formatIcsDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

/**
 * Generate a valid ICS calendar string from a list of events.
 *
 * Each event becomes a VEVENT with:
 *   - UID: a stable per-event identifier (astrolabe-<ts>-<idx>@astrolabe.example)
 *   - DTSTAMP: when the ICS was generated (now, UTC)
 *   - DTSTART: the event's start (UTC)
 *   - DTEND: start + 1 hour (UTC)
 *   - SUMMARY: the event title (escaped)
 *   - DESCRIPTION: free-form text (escaped)
 *
 * Returns the full VCALENDAR block with CRLF line endings, ready to be
 * wrapped in a Blob and downloaded as a `.ics` file.
 */
export function generateIcs(events: IcsEvent[]): string {
  const now = new Date();
  const dtstamp = formatIcsDate(now);
  const stampBase = Date.now().toString(36);

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Astrolabe//Employee Journey//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  events.forEach((ev, i) => {
    const start = new Date(ev.dtStart);
    // Guard against invalid dates — skip the event if it can't be parsed.
    if (Number.isNaN(start.getTime())) return;

    const end = new Date(start.getTime() + 60 * 60 * 1000); // +1h
    const uid = `astrolabe-${stampBase}-${i}@astrolabe.example`;

    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${formatIcsDate(start)}`,
      `DTEND:${formatIcsDate(end)}`,
      `SUMMARY:${escapeIcsText(ev.summary)}`,
      `DESCRIPTION:${escapeIcsText(ev.description)}`,
      "END:VEVENT",
    );
  });

  lines.push("END:VCALENDAR");
  // RFC 5545 §3.1 requires CRLF line endings.
  return lines.join("\r\n");
}
