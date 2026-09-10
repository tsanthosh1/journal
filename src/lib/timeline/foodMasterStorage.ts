import { getFirebaseAdmin } from "../firebaseAdmin";
import { MasterFoodItem, FoodPrimaryAnchor, FoodOccasion } from "./types";

const MASTER_FOOD_COLLECTION = "master_food_items";

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

/**
 * Fetch all master food items for a user, sorted by frequency (most consumed first)
 */
export async function getMasterFoodItems(userId: string): Promise<MasterFoodItem[]> {
  if (!userId || userId === "default_user" || userId === "default-user") {
    return [];
  }

  const { db } = getFirebaseAdmin();
  const possibleUserIds = Array.from(
    new Set([userId, userId.replace(/[^a-zA-Z0-9_-]/g, "_")])
  ).filter(Boolean);

  const snap = await db
    .collection(MASTER_FOOD_COLLECTION)
    .where("userId", "in", possibleUserIds.slice(0, 10))
    .get();

  const items: MasterFoodItem[] = [];
  snap.forEach((doc) => {
    items.push({ ...(doc.data() as MasterFoodItem), id: doc.id });
  });

  return items.sort((a, b) => {
    if (b.frequencyCount !== a.frequencyCount) {
      return (b.frequencyCount || 0) - (a.frequencyCount || 0);
    }
    return a.name.localeCompare(b.name);
  });
}

/**
 * Create or update a single master food item
 */
export async function saveOrUpdateMasterFoodItem(
  userId: string,
  data: Partial<MasterFoodItem> & { name: string }
): Promise<MasterFoodItem> {
  const { db } = getFirebaseAdmin();
  const cleanName = data.name.trim();
  const normalized = cleanName.toLowerCase();
  const now = new Date().toISOString();

  // Check if item already exists for this user
  const possibleUserIds = Array.from(
    new Set([userId, userId.replace(/[^a-zA-Z0-9_-]/g, "_")])
  ).filter(Boolean);

  const existingSnap = await db
    .collection(MASTER_FOOD_COLLECTION)
    .where("userId", "in", possibleUserIds.slice(0, 10))
    .where("normalizedName", "==", normalized)
    .limit(1)
    .get();

  if (!existingSnap.empty) {
    const doc = existingSnap.docs[0];
    const existing = doc.data() as MasterFoodItem;
    const updated: MasterFoodItem = {
      ...existing,
      ...data,
      id: doc.id,
      name: cleanName,
      normalizedName: normalized,
      frequencyCount: (existing.frequencyCount || 0) + (data.frequencyCount !== undefined ? data.frequencyCount : 0),
      updatedAt: now,
    };
    await doc.ref.set(sanitizeForFirestore(updated), { merge: true });
    return updated;
  } else {
    const newDocRef = db.collection(MASTER_FOOD_COLLECTION).doc();
    const newItem: MasterFoodItem = {
      id: newDocRef.id,
      userId,
      name: cleanName,
      normalizedName: normalized,
      defaultAnchor: data.defaultAnchor,
      defaultOccasion: data.defaultOccasion,
      defaultCalories: data.defaultCalories,
      category: data.category || "General",
      frequencyCount: data.frequencyCount !== undefined ? data.frequencyCount : 1,
      lastConsumedAt: data.lastConsumedAt || now,
      createdAt: now,
      updatedAt: now,
    };
    await newDocRef.set(sanitizeForFirestore(newItem));
    return newItem;
  }
}

/**
 * Automatically record a batch of consumed food items into the master food library.
 * Increments frequency count and updates lastConsumedAt.
 */
export async function recordFoodItemsConsumed(
  userId: string,
  items: string[],
  anchor?: FoodPrimaryAnchor,
  occasion?: FoodOccasion,
  date?: string
): Promise<void> {
  if (!userId || !items || items.length === 0) return;

  const now = new Date().toISOString();
  const validItems = items
    .map((s) => s.trim())
    .filter((s) => s.length > 1);

  for (const name of validItems) {
    try {
      await saveOrUpdateMasterFoodItem(userId, {
        name,
        defaultAnchor: anchor,
        defaultOccasion: occasion,
        frequencyCount: 1,
        lastConsumedAt: date ? `${date}T12:00:00.000Z` : now,
      });
    } catch (err) {
      console.warn(`[foodMasterStorage] Error recording item "${name}":`, err);
    }
  }
}
