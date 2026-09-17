import { getFirebaseAdmin } from "../firebaseAdmin";
import { sanitizeForFirestore } from "../subscriptionUtils";
import { GcpBillingDatasetConfig, DEFAULT_GCP_BILLING_CONFIG } from "./types";

function getUserConfigsCollection(db: FirebaseFirestore.Firestore, userId: string) {
  const safeId = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return db.collection("users").doc(safeId).collection("gcp_billing_configs");
}

/**
 * Retrieves all registered GCP billing dataset configurations for a user.
 * If none exist, seeds and returns the default primary account config.
 */
export async function getGcpBillingConfigs(userId: string): Promise<GcpBillingDatasetConfig[]> {
  if (!userId || userId === "default_user" || userId === "default-user") {
    return [DEFAULT_GCP_BILLING_CONFIG];
  }

  const { db } = getFirebaseAdmin();
  const colRef = getUserConfigsCollection(db, userId);
  const snap = await colRef.get();

  if (snap.empty) {
    // Seed default configuration
    await colRef.doc(DEFAULT_GCP_BILLING_CONFIG.id).set(sanitizeForFirestore(DEFAULT_GCP_BILLING_CONFIG));
    return [DEFAULT_GCP_BILLING_CONFIG];
  }

  const configs: GcpBillingDatasetConfig[] = [];
  snap.forEach((doc) => {
    configs.push({ id: doc.id, ...(doc.data() as Omit<GcpBillingDatasetConfig, "id">) });
  });

  return configs.sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0));
}

/**
 * Saves or updates a GCP billing dataset configuration for a user.
 */
export async function saveGcpBillingConfig(
  userId: string,
  config: Partial<GcpBillingDatasetConfig> & { name: string; projectId: string; datasetId: string; tableId: string },
): Promise<GcpBillingDatasetConfig> {
  const { db } = getFirebaseAdmin();
  const colRef = getUserConfigsCollection(db, userId);

  const id = config.id || `gcp_ds_${Date.now()}`;
  const now = new Date().toISOString();

  // If set as default, unset other defaults
  if (config.isDefault) {
    const existing = await colRef.where("isDefault", "==", true).get();
    const batch = db.batch();
    existing.forEach((d) => {
      if (d.id !== id) {
        batch.update(d.ref, { isDefault: false });
      }
    });
    await batch.commit();
  }

  const finalConfig: GcpBillingDatasetConfig = {
    id,
    name: config.name.trim(),
    billingAccountId: config.billingAccountId?.trim() || undefined,
    projectId: config.projectId.trim(),
    datasetId: config.datasetId.trim(),
    tableId: config.tableId.trim(),
    location: config.location?.trim() || "asia-south1",
    isDefault: config.isDefault ?? false,
    createdAt: config.createdAt || now,
    updatedAt: now,
  };

  await colRef.doc(id).set(sanitizeForFirestore(finalConfig), { merge: true });
  return finalConfig;
}

/**
 * Deletes a GCP billing dataset configuration for a user.
 */
export async function deleteGcpBillingConfig(userId: string, configId: string): Promise<boolean> {
  const { db } = getFirebaseAdmin();
  const colRef = getUserConfigsCollection(db, userId);
  await colRef.doc(configId).delete();
  return true;
}
