import { SubscriptionSource } from "./types";
import { Subscription } from "../subscriptionTypes";
import { apartmentMaintenanceSource, apartmentWaterCorpusSource } from "../apartment/sources";
import { tnebSource } from "../tneb/source";
import { chennaiWaterSource } from "../chennaiWater/source";
import { gmailSource } from "../gmail/source";
import { smsSource } from "../sms/source";
import { fixedAmountSource } from "./fixedSource";
import { manualSource } from "./manualSource";

export const SUBSCRIPTION_SOURCES: Record<string, SubscriptionSource> = {
  apartment_maintenance: apartmentMaintenanceSource,
  apartment_water: apartmentWaterCorpusSource,
  tneb: tnebSource,
  chennai_water: chennaiWaterSource,
  gmail: gmailSource,
  sms: smsSource,
  fixed: fixedAmountSource,
  manual: manualSource,
};

/**
 * Returns all registered subscription sources
 */
export function getAllSubscriptionSources(): SubscriptionSource[] {
  return Object.values(SUBSCRIPTION_SOURCES);
}

/**
 * Retrieves a source implementation by its identifier
 */
export function getSubscriptionSource(id: string): SubscriptionSource | undefined {
  return SUBSCRIPTION_SOURCES[id];
}

/**
 * Determines the matching SubscriptionSource implementation for an existing Subscription
 */
export function getSourceForSubscription(subscription: Subscription): SubscriptionSource {
  if (subscription.source === "APARTMENT_MODULE" || subscription.apartmentConfig) {
    const filter = (subscription.apartmentConfig?.categoryFilter || "").toLowerCase();
    if (filter.includes("water") || filter.includes("corpus")) {
      return apartmentWaterCorpusSource;
    }
    return apartmentMaintenanceSource;
  }

  if (subscription.source === "TNEB_MODULE" || subscription.tnebConfig) {
    return tnebSource;
  }

  if (subscription.source === "CHENNAI_WATER_MODULE" || subscription.chennaiWaterConfig) {
    return chennaiWaterSource;
  }

  if (subscription.source === "SMS_AUTOMATED" || subscription.smsConfig?.enabled) {
    return smsSource;
  }

  if (subscription.source === "EMAIL_AUTOMATED" || subscription.emailConfig?.enabled) {
    return gmailSource;
  }

  if (subscription.billingType === "FIXED_TENURE") {
    return fixedAmountSource;
  }

  return manualSource;
}
