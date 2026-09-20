/**
 * Date and Month formatting utilities that render human-readable month names instead of numbers.
 */

const MONTH_NAMES_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const MONTH_NAMES_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * Converts "YYYY-MM" into a readable month name like "January 2026" or "Jan 2026".
 */
export function formatMonthName(
  monthStr: string | undefined | null,
  style: "long" | "short" = "long"
): string {
  if (!monthStr || typeof monthStr !== "string") return "";
  const parts = monthStr.trim().split("-");
  if (parts.length < 2) return monthStr;

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    return monthStr;
  }

  const name =
    style === "short" ? MONTH_NAMES_SHORT[month - 1] : MONTH_NAMES_LONG[month - 1];
  return `${name} ${year}`;
}

/**
 * Converts "YYYY-MM-DD" into a readable date string like "18 Aug 2026" or "18 August 2026".
 */
export function formatReadableDate(
  dateStr: string | undefined | null,
  style: "short" | "long" = "short"
): string {
  if (!dateStr || typeof dateStr !== "string") return "";

  // Extract YYYY-MM-DD from start if it's an ISO timestamp
  const cleanStr = dateStr.slice(0, 10);
  const parts = cleanStr.split("-");
  if (parts.length !== 3) return dateStr;

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);

  if (isNaN(year) || isNaN(month) || isNaN(day) || month < 1 || month > 12) {
    return dateStr;
  }

  const monthName =
    style === "short" ? MONTH_NAMES_SHORT[month - 1] : MONTH_NAMES_LONG[month - 1];
  return `${day} ${monthName} ${year}`;
}

/**
 * Formats a start and end date into readable range like "1 Jan 2026 to 19 Sep 2026".
 */
export function formatDateRange(
  start: string | null | undefined,
  end: string | null | undefined
): string | null {
  if (!start && !end) return null;
  const startFmt = start ? formatReadableDate(start) : "";
  const endFmt = end ? formatReadableDate(end) : "";
  if (startFmt && endFmt) return `${startFmt} to ${endFmt}`;
  return startFmt || endFmt || null;
}
