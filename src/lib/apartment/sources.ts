import { SubscriptionSource, SubscriptionSourceSyncResult } from "../sources/types";
import { Subscription } from "../subscriptionTypes";
import { getApartmentSession, getCachedApartmentBills, saveCachedApartmentBills } from "./storage";
import { fetchHomefyBills } from "./client";
import { syncApartmentBillsToSubscriptions } from "./subscriptionBridge";
import { HomefyBillRecord } from "./types";

/**
 * Apartment Maintenance Source
 * Handles society quarterly maintenance charges from Homefy
 */
export class ApartmentMaintenanceSource implements SubscriptionSource {
  id = "apartment_maintenance";
  sourceType = "APARTMENT_MODULE" as const;
  name = "Apartment Maintenance (Quarterly)";
  shortName = "Apt Maintenance";
  description = "Syncs quarterly maintenance society bills and payment proofs from Homefy";
  icon = "🏢";
  defaultCategory = "Housing & Rent";
  defaultBillingCycle = "QUARTERLY" as const;
  defaultName = "Apartment Maintenance";
  supportsStatement = true;
  supportsPayment = true;

  configFields = [
    {
      key: "categoryFilter",
      label: "Bill Category",
      type: "select" as const,
      defaultValue: "Maintenance Bill",
      options: [
        { label: "Maintenance Bill (Quarterly)", value: "Maintenance Bill" },
        { label: "All Bills Combined", value: "ALL" },
      ],
      required: true,
    },
  ];

  createDefaultConfig() {
    return {
      categoryFilter: "Maintenance Bill",
      autoSyncWithApartmentModule: true,
    };
  }

  async sync(
    subscription: Subscription,
    options?: { userId?: string; onLog?: (level: string, message: string, details?: any) => void },
  ): Promise<SubscriptionSourceSyncResult> {
    const userId = options?.userId || subscription.userId || "default-user";
    const onLog = options?.onLog;

    try {
      onLog?.("info", `Syncing Apartment Maintenance for "${subscription.name}"`);
      const session = await getApartmentSession(userId);
      let bills: HomefyBillRecord[] = [];

      if (session?.swappedToken) {
        try {
          bills = await fetchHomefyBills(session.swappedToken, "ALL");
          await saveCachedApartmentBills(bills, userId);
        } catch (e: any) {
          onLog?.("warn", `Live Homefy fetch failed, using cached bills: ${e.message}`);
          bills = await getCachedApartmentBills(userId);
        }
      } else {
        bills = await getCachedApartmentBills(userId);
      }

      const maintenanceBills = bills.filter((b) => {
        const cat = (b.category?.name || "Maintenance Bill").toLowerCase();
        return cat.includes("maintenance");
      });

      const updatedCount = await syncApartmentBillsToSubscriptions(bills, userId, subscription.id);
      onLog?.("success", `Apartment Maintenance synced: ${maintenanceBills.length} maintenance bills found.`);

      return {
        success: true,
        cyclesUpdated: updatedCount,
        billsProcessed: maintenanceBills.length,
        message: `Synced ${maintenanceBills.length} maintenance bills from Homefy`,
      };
    } catch (err: any) {
      onLog?.("error", `Apartment Maintenance sync failed: ${err.message}`);
      return {
        success: false,
        cyclesUpdated: 0,
        error: err.message,
      };
    }
  }
}

/**
 * Apartment Water & Corpus Source
 * Handles society monthly water charges along with corpus fund assessments from Homefy
 */
export class ApartmentWaterCorpusSource implements SubscriptionSource {
  id = "apartment_water";
  sourceType = "APARTMENT_MODULE" as const;
  name = "Apartment Water & Corpus (Monthly)";
  shortName = "Apt Water & Corpus";
  description = "Syncs monthly society water consumption charges & corpus fund dues from Homefy";
  icon = "💧";
  defaultCategory = "Housing & Rent";
  defaultBillingCycle = "MONTHLY" as const;
  defaultName = "Apartment Water & Corpus";
  supportsStatement = true;
  supportsPayment = true;

  configFields = [
    {
      key: "categoryFilter",
      label: "Bill Category",
      type: "select" as const,
      defaultValue: "Water Bill",
      options: [
        { label: "Water & Corpus Combined", value: "Water Bill" },
        { label: "Water Bill Only", value: "Water Bill" },
        { label: "Corpus Fund Only", value: "Corpus Fund" },
      ],
      required: true,
    },
  ];

  createDefaultConfig() {
    return {
      categoryFilter: "Water Bill",
      autoSyncWithApartmentModule: true,
    };
  }

  async sync(
    subscription: Subscription,
    options?: { userId?: string; onLog?: (level: string, message: string, details?: any) => void },
  ): Promise<SubscriptionSourceSyncResult> {
    const userId = options?.userId || subscription.userId || "default-user";
    const onLog = options?.onLog;

    try {
      onLog?.("info", `Syncing Apartment Water & Corpus for "${subscription.name}"`);
      const session = await getApartmentSession(userId);
      let bills: HomefyBillRecord[] = [];

      if (session?.swappedToken) {
        try {
          bills = await fetchHomefyBills(session.swappedToken, "ALL");
          await saveCachedApartmentBills(bills, userId);
        } catch (e: any) {
          onLog?.("warn", `Live Homefy fetch failed, using cached bills: ${e.message}`);
          bills = await getCachedApartmentBills(userId);
        }
      } else {
        bills = await getCachedApartmentBills(userId);
      }

      const waterCorpusBills = bills.filter((b) => {
        const cat = (b.category?.name || "").toLowerCase();
        return cat.includes("water") || cat.includes("corpus");
      });

      const updatedCount = await syncApartmentBillsToSubscriptions(bills, userId, subscription.id);
      onLog?.("success", `Apartment Water & Corpus synced: ${waterCorpusBills.length} water/corpus bills found.`);

      return {
        success: true,
        cyclesUpdated: updatedCount,
        billsProcessed: waterCorpusBills.length,
        message: `Synced ${waterCorpusBills.length} water/corpus bills from Homefy`,
      };
    } catch (err: any) {
      onLog?.("error", `Apartment Water & Corpus sync failed: ${err.message}`);
      return {
        success: false,
        cyclesUpdated: 0,
        error: err.message,
      };
    }
  }
}

export const apartmentMaintenanceSource = new ApartmentMaintenanceSource();
export const apartmentWaterCorpusSource = new ApartmentWaterCorpusSource();
