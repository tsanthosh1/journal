// Core Types for Life Events Diary & AI Timeline

export type StandardActivityType =
  | "WORK"
  | "FITNESS"
  | "FOOD"
  | "FINANCE"
  | "SOCIAL"
  | "TRAVEL"
  | "REFLECTION"
  | "GENERAL";

export interface ActivityMeta {
  id: string;
  name: string;
  icon: string;
  color: string; // Tailwind color token or hex
  badgeColor: string;
  borderColor: string;
  bgColor: string;
  description: string;
}

export interface ActivityFieldDefinition {
  key: string;
  label: string;
  type: "string" | "number" | "boolean" | "list" | "unit_number";
  unit?: string; // e.g. "km", "min", "kcal", "INR"
  description?: string;
  suggestedValues?: string[];
  required?: boolean;
}

export interface SchemaChangelogEntry {
  version: number;
  fieldKey: string;
  fieldType: string;
  action: "ADDED" | "MODIFIED" | "REMOVED";
  sampleValue?: any;
  timestamp: string;
  reason?: string;
}

export interface ActivityJsonSchema {
  activityType: string;
  version: number;
  title: string;
  description: string;
  jsonSchema: {
    $schema?: string;
    type: "object";
    properties: Record<
      string,
      {
        type: string;
        title?: string;
        description?: string;
        unit?: string;
        items?: { type: string };
        enum?: string[];
      }
    >;
    required?: string[];
    additionalProperties?: boolean;
  };
  fields: ActivityFieldDefinition[];
  changelog: SchemaChangelogEntry[];
  updatedAt: string;
}

export interface LifeEvent {
  id: string;
  userId: string;
  date: string; // "YYYY-MM-DD"
  startTime?: string; // "HH:MM" 24h format (e.g. "08:30")
  endTime?: string; // "HH:MM" 24h format (e.g. "09:15")
  durationMinutes?: number; // e.g. 45
  title: string;
  description: string;
  activityType: string; // WORK, FITNESS, etc.
  mood?: string; // "Energized", "Tired", "Focused", "Happy", etc.
  tags: string[];
  rawSpokenText?: string;
  attributes: Record<string, any>;
  schemaVersion?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ExtractedEventCandidate {
  title: string;
  description: string;
  activityType: string;
  date?: string; // "YYYY-MM-DD"
  startTime?: string;
  endTime?: string;
  durationMinutes?: number;
  mood?: string;
  tags: string[];
  attributes: Record<string, any>;
  newAttributesDiscovered?: {
    fieldKey: string;
    label: string;
    suggestedType: "string" | "number" | "boolean" | "list" | "unit_number";
    unit?: string;
    sampleValue: any;
  }[];
}

export interface AiExtractionResult {
  events: ExtractedEventCandidate[];
  rawTranscript: string;
  summaryOfNarration: string;
  modelUsed: string;
  executionDurationMs: number;
}

export interface TimelineDaySummary {
  date: string;
  totalEvents: number;
  totalDurationMinutes: number;
  activityCounts: Record<string, number>;
  moodsDetected: string[];
}

export interface AiConfig {
  provider: "gemini" | "openrouter";
  apiKey?: string;
  isConfigured: boolean;
  model: string;
  updatedAt?: string;
}

export const ACTIVITY_META_MAP: Record<string, ActivityMeta> = {
  WORK: {
    id: "WORK",
    name: "Work & Projects",
    icon: "💼",
    color: "#818cf8",
    badgeColor: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
    borderColor: "border-indigo-500/30",
    bgColor: "from-indigo-950/40 via-slate-900/60 to-slate-900/40",
    description: "Meetings, deep work, coding, deliverables, and tasks",
  },
  FITNESS: {
    id: "FITNESS",
    name: "Health & Fitness",
    icon: "🏃",
    color: "#34d399",
    badgeColor: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    borderColor: "border-emerald-500/30",
    bgColor: "from-emerald-950/40 via-slate-900/60 to-slate-900/40",
    description: "Workouts, running, gym, sports, walking, vitals",
  },
  FOOD: {
    id: "FOOD",
    name: "Food & Dining",
    icon: "🍽️",
    color: "#fbbf24",
    badgeColor: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    borderColor: "border-amber-500/30",
    bgColor: "from-amber-950/40 via-slate-900/60 to-slate-900/40",
    description: "Breakfast, lunch, dinner, snacks, drinks, coffee",
  },
  FINANCE: {
    id: "FINANCE",
    name: "Finance & Purchases",
    icon: "💰",
    color: "#38bdf8",
    badgeColor: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    borderColor: "border-sky-500/30",
    bgColor: "from-sky-950/40 via-slate-900/60 to-slate-900/40",
    description: "Shopping, payments, dining out, bills, investments",
  },
  SOCIAL: {
    id: "SOCIAL",
    name: "Social & Friends",
    icon: "👥",
    color: "#f472b6",
    badgeColor: "bg-pink-500/15 text-pink-300 border-pink-500/30",
    borderColor: "border-pink-500/30",
    bgColor: "from-pink-950/40 via-slate-900/60 to-slate-900/40",
    description: "Hangouts, family, calls, parties, networking",
  },
  TRAVEL: {
    id: "TRAVEL",
    name: "Travel & Commute",
    icon: "🚗",
    color: "#a78bfa",
    badgeColor: "bg-violet-500/15 text-violet-300 border-violet-500/30",
    borderColor: "border-violet-500/30",
    bgColor: "from-violet-950/40 via-slate-900/60 to-slate-900/40",
    description: "Driving, metro, flights, cab rides, commute",
  },
  REFLECTION: {
    id: "REFLECTION",
    name: "Reflection & Mood",
    icon: "🧘",
    color: "#2dd4bf",
    badgeColor: "bg-teal-500/15 text-teal-300 border-teal-500/30",
    borderColor: "border-teal-500/30",
    bgColor: "from-teal-950/40 via-slate-900/60 to-slate-900/40",
    description: "Journaling, gratitude, meditation, thoughts, mood",
  },
  GENERAL: {
    id: "GENERAL",
    name: "Daily Moments",
    icon: "✨",
    color: "#94a3b8",
    badgeColor: "bg-slate-700/50 text-slate-300 border-slate-600/40",
    borderColor: "border-slate-700/60",
    bgColor: "from-slate-900 via-slate-900/60 to-slate-900/40",
    description: "Hobbies, chores, reading, entertainment, miscellaneous",
  },
};
