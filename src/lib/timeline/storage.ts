import { getFirebaseAdmin } from "../firebaseAdmin";
import {
  LifeEvent,
  ActivityJsonSchema,
  AiConfig,
  SchemaChangelogEntry,
  ActivityFieldDefinition,
} from "./types";
import defaultSchemas from "./schemas/defaultSchemas.json";

const EVENTS_COLLECTION = "life_events";
const SCHEMAS_COLLECTION = "event_schemas";
const SETTINGS_COLLECTION = "settings";
const AI_CONFIG_DOC = "ai_config";

/**
 * Clean data for Firestore write (converts undefined to null / removes undefined)
 */
function sanitizeForFirestore(obj: any): any {
  if (obj === undefined) return null;
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeForFirestore);
  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      clean[k] = sanitizeForFirestore(v);
    }
  }
  return clean;
}

// ─────────────────────────────────────────────────────────────
// Life Events Storage Operations
// ─────────────────────────────────────────────────────────────

export async function saveLifeEvent(event: Omit<LifeEvent, "id">, id?: string): Promise<LifeEvent> {
  const { db } = getFirebaseAdmin();
  const now = new Date().toISOString();
  const eventData = {
    ...event,
    createdAt: event.createdAt || now,
    updatedAt: now,
  };

  if (id) {
    await db.collection(EVENTS_COLLECTION).doc(id).set(sanitizeForFirestore(eventData), { merge: true });
    return { ...eventData, id };
  } else {
    const docRef = await db.collection(EVENTS_COLLECTION).add(sanitizeForFirestore(eventData));
    return { ...eventData, id: docRef.id };
  }
}

export async function saveLifeEventsBatch(events: Omit<LifeEvent, "id">[]): Promise<LifeEvent[]> {
  const { db } = getFirebaseAdmin();
  const batch = db.batch();
  const now = new Date().toISOString();
  const savedEvents: LifeEvent[] = [];

  for (const ev of events) {
    const docRef = db.collection(EVENTS_COLLECTION).doc();
    const eventData: LifeEvent = {
      ...ev,
      id: docRef.id,
      createdAt: ev.createdAt || now,
      updatedAt: now,
    };
    batch.set(docRef, sanitizeForFirestore(eventData));
    savedEvents.push(eventData);
  }

  await batch.commit();
  return savedEvents;
}

export async function getLifeEventsByDate(date: string, userId = "default_user"): Promise<LifeEvent[]> {
  const { db } = getFirebaseAdmin();
  const snap = await db
    .collection(EVENTS_COLLECTION)
    .where("userId", "==", userId)
    .where("date", "==", date)
    .get();

  const events: LifeEvent[] = [];
  snap.forEach((doc) => {
    events.push({ ...(doc.data() as LifeEvent), id: doc.id });
  });

  // Sort chronologically by startTime (empty startTimes go to end)
  return events.sort((a, b) => {
    if (!a.startTime && !b.startTime) return 0;
    if (!a.startTime) return 1;
    if (!b.startTime) return -1;
    return a.startTime.localeCompare(b.startTime);
  });
}

export async function getLifeEventsRange(
  startDate: string,
  endDate: string,
  userId = "default_user"
): Promise<LifeEvent[]> {
  const { db } = getFirebaseAdmin();
  const snap = await db
    .collection(EVENTS_COLLECTION)
    .where("userId", "==", userId)
    .where("date", ">=", startDate)
    .where("date", "<=", endDate)
    .get();

  const events: LifeEvent[] = [];
  snap.forEach((doc) => {
    events.push({ ...(doc.data() as LifeEvent), id: doc.id });
  });

  return events.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (!a.startTime) return 1;
    if (!b.startTime) return -1;
    return a.startTime.localeCompare(b.startTime);
  });
}

export async function getLifeEventById(id: string): Promise<LifeEvent | null> {
  const { db } = getFirebaseAdmin();
  const doc = await db.collection(EVENTS_COLLECTION).doc(id).get();
  if (!doc.exists) return null;
  return { ...(doc.data() as LifeEvent), id: doc.id };
}

export async function updateLifeEvent(id: string, updates: Partial<LifeEvent>): Promise<LifeEvent | null> {
  const { db } = getFirebaseAdmin();
  const docRef = db.collection(EVENTS_COLLECTION).doc(id);
  const doc = await docRef.get();
  if (!doc.exists) return null;

  const updatedData = {
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await docRef.update(sanitizeForFirestore(updatedData));
  const latest = await docRef.get();
  return { ...(latest.data() as LifeEvent), id };
}

export async function deleteLifeEvent(id: string): Promise<boolean> {
  const { db } = getFirebaseAdmin();
  await db.collection(EVENTS_COLLECTION).doc(id).delete();
  return true;
}

// ─────────────────────────────────────────────────────────────
// Versioned Activity JSON Schema Storage & Evolution
// ─────────────────────────────────────────────────────────────

export async function getAllActivitySchemas(userId = "default_user"): Promise<Record<string, ActivityJsonSchema>> {
  const { db } = getFirebaseAdmin();
  const snap = await db.collection(SCHEMAS_COLLECTION).get();

  const schemas: Record<string, ActivityJsonSchema> = {};

  // First seed defaults
  const defaults = defaultSchemas as Record<string, ActivityJsonSchema>;
  for (const [type, schema] of Object.entries(defaults)) {
    schemas[type] = schema;
  }

  // Override with any user-customized or evolved schemas in Firestore
  snap.forEach((doc) => {
    const data = doc.data() as ActivityJsonSchema;
    if (data.activityType) {
      schemas[data.activityType] = data;
    }
  });

  return schemas;
}

export async function getActivitySchema(activityType: string): Promise<ActivityJsonSchema> {
  const { db } = getFirebaseAdmin();
  const doc = await db.collection(SCHEMAS_COLLECTION).doc(activityType.toUpperCase()).get();

  if (doc.exists) {
    return doc.data() as ActivityJsonSchema;
  }

  const defaults = defaultSchemas as Record<string, ActivityJsonSchema>;
  if (defaults[activityType.toUpperCase()]) {
    return defaults[activityType.toUpperCase()];
  }

  // Fallback dynamic schema
  return {
    activityType: activityType.toUpperCase(),
    version: 1,
    title: `${activityType} Schema`,
    description: `Dynamic schema for ${activityType}`,
    jsonSchema: {
      type: "object",
      properties: {},
      additionalProperties: true,
    },
    fields: [],
    changelog: [],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Evolves an activity schema when AI detects new attributes
 */
export async function evolveActivitySchema(
  activityType: string,
  newFields: {
    fieldKey: string;
    label: string;
    type: ActivityFieldDefinition["type"];
    unit?: string;
    sampleValue?: any;
  }[]
): Promise<ActivityJsonSchema> {
  const current = await getActivitySchema(activityType);
  const now = new Date().toISOString();
  let hasChanges = false;

  const updatedFields = [...current.fields];
  const updatedProperties = { ...current.jsonSchema.properties };
  const newChangelogs: SchemaChangelogEntry[] = [];
  const nextVersion = current.version + 1;

  for (const nf of newFields) {
    const key = nf.fieldKey.trim();
    if (!key) continue;

    // Check if key already exists
    const exists = updatedFields.some((f) => f.key === key);
    if (!exists) {
      hasChanges = true;
      updatedFields.push({
        key,
        label: nf.label || key,
        type: nf.type,
        unit: nf.unit,
        description: `Discovered from speech entry on ${now.split("T")[0]}`,
      });

      // Map to JSON Schema types
      const jsonType = nf.type === "number" || nf.type === "unit_number" ? "number" : nf.type === "list" ? "array" : "string";
      updatedProperties[key] = {
        type: jsonType,
        title: nf.label || key,
        unit: nf.unit,
        ...(jsonType === "array" ? { items: { type: "string" } } : {}),
      };

      newChangelogs.push({
        version: nextVersion,
        fieldKey: key,
        fieldType: nf.type,
        action: "ADDED",
        sampleValue: nf.sampleValue,
        timestamp: now,
        reason: `Auto-evolved via AI voice narration`,
      });
    }
  }

  if (!hasChanges) {
    return current;
  }

  const evolvedSchema: ActivityJsonSchema = {
    ...current,
    version: nextVersion,
    fields: updatedFields,
    jsonSchema: {
      ...current.jsonSchema,
      properties: updatedProperties,
    },
    changelog: [...current.changelog, ...newChangelogs],
    updatedAt: now,
  };

  const { db } = getFirebaseAdmin();
  await db
    .collection(SCHEMAS_COLLECTION)
    .doc(activityType.toUpperCase())
    .set(sanitizeForFirestore(evolvedSchema), { merge: true });

  return evolvedSchema;
}

// ─────────────────────────────────────────────────────────────
// AI Configuration Storage (Google Gemini & OpenRouter)
// ─────────────────────────────────────────────────────────────

export async function getAiConfig(): Promise<AiConfig> {
  const geminiEnvKey = process.env.GEMINI_API_KEY;
  const openRouterEnvKey = process.env.OPENROUTER_API_KEY;

  try {
    const { db } = getFirebaseAdmin();
    const doc = await db.collection(SETTINGS_COLLECTION).doc(AI_CONFIG_DOC).get();
    if (doc.exists) {
      const data = doc.data() as any;
      const provider = (data.provider as "gemini" | "openrouter") || (data.apiKey?.startsWith("AIzaSy") ? "gemini" : "openrouter");
      const defaultKey = provider === "gemini" ? geminiEnvKey : openRouterEnvKey;
      const key = data.apiKey || defaultKey || geminiEnvKey || openRouterEnvKey;
      const defaultModel = provider === "gemini" ? "gemini-3.6-flash" : "openrouter/free";

      return {
        provider,
        apiKey: key,
        isConfigured: Boolean(key && key.trim().length > 0),
        model: data.model || defaultModel,
        updatedAt: data.updatedAt,
      };
    }
  } catch (err) {
    console.warn("[storage] Could not read ai_config doc, using env:", err);
  }

  // Default fallback if no doc stored yet
  const hasGemini = Boolean(geminiEnvKey && geminiEnvKey.trim().length > 0);
  const provider = hasGemini ? "gemini" : "openrouter";
  const key = hasGemini ? geminiEnvKey : openRouterEnvKey;

  return {
    provider,
    apiKey: key,
    isConfigured: Boolean(key && key.trim().length > 0),
    model: provider === "gemini" ? "gemini-3.6-flash" : "openrouter/free",
  };
}

export async function saveAiConfig(config: {
  provider?: "gemini" | "openrouter";
  apiKey?: string;
  model?: string;
}): Promise<AiConfig> {
  const { db } = getFirebaseAdmin();
  const now = new Date().toISOString();
  const existing = await getAiConfig();

  const provider = config.provider || (config.apiKey?.startsWith("AIzaSy") ? "gemini" : existing.provider) || "gemini";
  const defaultModel = provider === "gemini" ? "gemini-3.6-flash" : "openrouter/free";

  const toSave: AiConfig = {
    provider,
    apiKey: config.apiKey !== undefined ? config.apiKey.trim() : existing.apiKey,
    model: config.model || (config.provider && config.provider !== existing.provider ? defaultModel : existing.model) || defaultModel,
    isConfigured: false,
    updatedAt: now,
  };

  await db.collection(SETTINGS_COLLECTION).doc(AI_CONFIG_DOC).set(sanitizeForFirestore(toSave), { merge: true });

  return {
    ...toSave,
    isConfigured: Boolean(toSave.apiKey && toSave.apiKey.length > 0),
  };
}
