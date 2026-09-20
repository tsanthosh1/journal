import { getFirebaseAdmin } from "@/lib/firebaseAdmin";
import { FitnessProfile } from "@/lib/timeline/types";
import { calculateBmi } from "./bmi";

export { calculateBmi };

function getCandidateUserIds(userId: string): string[] {
  const ids = new Set<string>();
  if (!userId) return [];
  ids.add(userId);
  if (userId.includes("@")) {
    ids.add(userId.replace(/[@.]/g, "_"));
  } else if (userId.includes("_")) {
    ids.add(userId.replace(/_/g, "."));
  }
  return Array.from(ids);
}

export async function getFitnessProfile(userId: string): Promise<FitnessProfile | null> {
  const { db } = getFirebaseAdmin();
  const candidates = getCandidateUserIds(userId);

  for (const candidate of candidates) {
    const docSnap = await db
      .collection("users")
      .doc(candidate)
      .collection("fitness_profile")
      .doc("biometrics")
      .get();

    if (docSnap.exists) {
      const data = docSnap.data() as FitnessProfile;
      return {
        ...data,
        userId,
      };
    }
  }

  return null;
}

export async function saveFitnessProfile(
  userId: string,
  updates: Partial<FitnessProfile>
): Promise<FitnessProfile> {
  const { db } = getFirebaseAdmin();
  const cleanUserId = userId.replace(/[@.]/g, "_");
  const docRef = db
    .collection("users")
    .doc(cleanUserId)
    .collection("fitness_profile")
    .doc("biometrics");

  const existing = await getFitnessProfile(userId);

  const heightCm = updates.heightCm !== undefined ? updates.heightCm : existing?.heightCm;
  const currentWeightKg =
    updates.currentWeightKg !== undefined ? updates.currentWeightKg : existing?.currentWeightKg;

  let bmi = updates.bmi;
  let bmiCategory = updates.bmiCategory;
  if (heightCm && currentWeightKg && heightCm > 0 && currentWeightKg > 0) {
    const calc = calculateBmi(currentWeightKg, heightCm);
    bmi = calc.bmi;
    bmiCategory = calc.category;
  }

  const now = new Date().toISOString();
  const profileData: FitnessProfile = {
    userId,
    heightCm: heightCm ?? undefined,
    heightUnit: updates.heightUnit || existing?.heightUnit || "cm",
    targetWeightKg: updates.targetWeightKg !== undefined ? updates.targetWeightKg : existing?.targetWeightKg,
    startingWeightKg: updates.startingWeightKg !== undefined ? updates.startingWeightKg : existing?.startingWeightKg,
    currentWeightKg: currentWeightKg ?? undefined,
    lastWeighedDate: updates.lastWeighedDate || existing?.lastWeighedDate,
    bmi,
    bmiCategory,
    updatedAt: now,
  };

  // Remove undefined values before saving to Firestore
  const toSave: Record<string, any> = {};
  for (const [k, v] of Object.entries(profileData)) {
    if (v !== undefined) {
      toSave[k] = v;
    }
  }

  await docRef.set(toSave, { merge: true });
  return profileData;
}
