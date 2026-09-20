import { FoodPrimaryAnchor, FoodOccasion, FoodOccasionType } from "./types";

export interface ParsedTimeResult {
  hasTime: boolean;
  startTime?: string; // "HH:MM" 24h
  date?: string; // "YYYY-MM-DD"
  isRelative: boolean;
  deltaMinutes?: number;
  matchedText?: string;
  cleanText: string;
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  fifteen: 15,
  twenty: 20,
  "twenty five": 25,
  "twenty-five": 25,
  thirty: 30,
  "forty five": 45,
  "forty-five": 45,
};

export function getRelativeDate(todayStr: string, offsetDays: number): string {
  const [y, m, d] = todayStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + offsetDays);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export function inferAnchorFromTime(startTime: string): FoodPrimaryAnchor {
  const [h] = startTime.split(":").map(Number);
  if (h >= 4 && h < 11) return "Breakfast";
  if (h >= 11 && h < 17) return "Lunch";
  return "Dinner";
}

export function inferOccasionFromTime(startTime: string, isSnack: boolean): FoodOccasion {
  const [h] = startTime.split(":").map(Number);
  const anchor = inferAnchorFromTime(startTime);
  if (anchor === "Breakfast") {
    return isSnack ? (h < 8 ? "Pre-Breakfast Snack" : "Post-Breakfast Snack") : "Breakfast";
  }
  if (anchor === "Lunch") {
    return isSnack ? (h < 13 ? "Pre-Lunch Snack" : "Post-Lunch Snack") : "Lunch / Brunch";
  }
  return isSnack ? (h >= 21 || h < 4 ? "Late-Night Snack" : "Pre-Dinner Snack") : "Dinner / Supper";
}

/**
 * Parses relative time phrases ("now", "few mins back", "1 hour back", etc.)
 * or absolute times ("at 1:30pm", "14:00") and returns computed HH:MM, adjusted date,
 * and cleaned text.
 */
export function parseRelativeOrAbsoluteTime(
  text: string,
  referenceTime?: string,
  referenceDate?: string
): ParsedTimeResult {
  const now = new Date();
  const refTime = referenceTime || `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const refDate = referenceDate || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const [currH, currM] = refTime.split(":").map(Number);
  const currentTotalMinutes = (isNaN(currH) ? now.getHours() : currH) * 60 + (isNaN(currM) ? now.getMinutes() : currM);

  let resultDate = refDate;
  // Check explicit date keywords first
  if (/\bday before yesterday\b/i.test(text)) {
    resultDate = getRelativeDate(refDate, -2);
  } else if (/\byesterday\b|\blast night\b/i.test(text)) {
    resultDate = getRelativeDate(refDate, -1);
  } else if (/\btomorrow\b/i.test(text)) {
    resultDate = getRelativeDate(refDate, 1);
  }

  let deltaMinutes: number | null = null;
  let matchedPhrase = "";

  // 1. Relative Time Expressions
  // Check "now", "just now", "right now", "just ate"
  const nowMatch = text.match(/\b(?:just\s+now|right\s+now|now|just\s+ate)\b/i);
  if (nowMatch) {
    deltaMinutes = 0;
    matchedPhrase = nowMatch[0];
  }

  // Check "few mins back", "a few minutes back", "couple mins back", etc.
  if (deltaMinutes === null) {
    const fewMatch = text.match(/\b(?:a\s+)?(?:few|couple(?:\s+of)?)\s*(?:mins?|minutes?)\s*(?:back|ago|before|earlier)?\b/i);
    if (fewMatch) {
      deltaMinutes = 5;
      matchedPhrase = fewMatch[0];
    }
  }

  // Check "half an hour back", "half hour ago", etc.
  if (deltaMinutes === null) {
    const halfHourMatch = text.match(/\b(?:half\s+(?:an?\s+)?hour|half\s*hr)\s*(?:back|ago|before|earlier)?\b/i);
    if (halfHourMatch) {
      deltaMinutes = 30;
      matchedPhrase = halfHourMatch[0];
    }
  }

  // Check "1.5 hours back", "one and a half hours ago"
  if (deltaMinutes === null) {
    const oneAndHalfMatch = text.match(/\b(?:1\.5|(?:one|a)\s+(?:and\s+a\s+half|&)\s+)\s*(?:hours?|hrs?)\s*(?:back|ago|before|earlier)?\b/i);
    if (oneAndHalfMatch) {
      deltaMinutes = 90;
      matchedPhrase = oneAndHalfMatch[0];
    }
  }

  // Check "an hour back", "one hour back", "1 hr ago", etc.
  if (deltaMinutes === null) {
    const oneHourMatch = text.match(/\b(?:an?|1|one)\s*(?:hour|hr)\s*(?:back|ago|before|earlier)\b/i);
    if (oneHourMatch) {
      deltaMinutes = 60;
      matchedPhrase = oneHourMatch[0];
    }
  }

  // Check "X mins/minutes back/ago/before" (numbers or word numbers)
  if (deltaMinutes === null) {
    const minMatch = text.match(/\b(\d+|one|two|three|four|five|ten|fifteen|twenty|twenty-five|twenty five|thirty|forty-five|forty five)\s*(?:mins?|minutes?)\s*(?:back|ago|before|earlier)\b/i);
    if (minMatch) {
      const rawVal = minMatch[1].toLowerCase();
      const val = NUMBER_WORDS[rawVal] !== undefined ? NUMBER_WORDS[rawVal] : parseInt(rawVal, 10);
      if (!isNaN(val)) {
        deltaMinutes = val;
        matchedPhrase = minMatch[0];
      }
    }
  }

  // Check "X hours/hrs back/ago/before" (numbers or word numbers)
  if (deltaMinutes === null) {
    const hrMatch = text.match(/\b(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:hours?|hrs?)\s*(?:back|ago|before|earlier)\b/i);
    if (hrMatch) {
      const rawVal = hrMatch[1].toLowerCase();
      const val = NUMBER_WORDS[rawVal] !== undefined ? NUMBER_WORDS[rawVal] : parseFloat(rawVal);
      if (!isNaN(val)) {
        deltaMinutes = Math.round(val * 60);
        matchedPhrase = hrMatch[0];
      }
    }
  }

  // If relative time matched
  if (deltaMinutes !== null) {
    let targetTotalMinutes = currentTotalMinutes - deltaMinutes;
    while (targetTotalMinutes < 0) {
      targetTotalMinutes += 24 * 60;
      resultDate = getRelativeDate(resultDate, -1);
    }
    while (targetTotalMinutes >= 24 * 60) {
      targetTotalMinutes -= 24 * 60;
      resultDate = getRelativeDate(resultDate, 1);
    }

    const h = Math.floor(targetTotalMinutes / 60);
    const m = targetTotalMinutes % 60;
    const startTime = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

    const cleanText = cleanTimeAndNoiseFromText(text, matchedPhrase);

    return {
      hasTime: true,
      startTime,
      date: resultDate,
      isRelative: true,
      deltaMinutes,
      matchedText: matchedPhrase,
      cleanText,
    };
  }

  // 2. Absolute Time Expressions (e.g. "at 1:30pm", "8 am", "around 14:00")
  const absMatch =
    text.match(/(?:at|around|from)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i) ||
    text.match(/\b(\d{1,2})(?::(\d{2}))\s*(am|pm)\b/i) ||
    text.match(/\b(\d{1,2})\s*(am|pm)\b/i);

  if (absMatch) {
    let hours = parseInt(absMatch[1], 10);
    const mins = absMatch[2] ? parseInt(absMatch[2], 10) : 0;
    const meridiem = (absMatch[3] || "").toLowerCase();

    if (meridiem === "pm" && hours < 12) hours += 12;
    if (meridiem === "am" && hours === 12) hours = 0;

    const startTime = `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
    const cleanText = cleanTimeAndNoiseFromText(text, absMatch[0]);

    return {
      hasTime: true,
      startTime,
      date: resultDate,
      isRelative: false,
      matchedText: absMatch[0],
      cleanText,
    };
  }

  // No explicit time found
  return {
    hasTime: false,
    date: resultDate,
    isRelative: false,
    cleanText: cleanTimeAndNoiseFromText(text, ""),
  };
}

function cleanTimeAndNoiseFromText(text: string, matchedPhrase: string): string {
  let cleaned = text;
  if (matchedPhrase) {
    cleaned = cleaned.replace(matchedPhrase, "");
  }

  // Remove common absolute time patterns that might remain
  cleaned = cleaned.replace(/(?:at|around|from)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?/gi, "");

  // Remove date noise
  cleaned = cleaned.replace(/\b(?:today|yesterday|tomorrow|day before yesterday|last night)\b/gi, "");

  // Remove leading conversational fillers
  cleaned = cleaned.replace(/^(?:i had|i ate|had|ate|eating|having|ordered|just had|just ate|i drank|drank|drinking)\s+/gi, "");

  // Remove trailing prepositions or conjunctions
  cleaned = cleaned.replace(/\s+(?:at|around|on|for|in)$/gi, "");

  // Collapse excess whitespace and trim
  cleaned = cleaned.replace(/\s{2,}/g, " ").trim();

  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  return cleaned;
}
