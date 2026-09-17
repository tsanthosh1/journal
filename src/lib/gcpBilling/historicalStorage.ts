import { getFirebaseAdmin } from "@/lib/firebaseAdmin";
import { ParsedGcpInvoice } from "./csvParser";

export interface GcpHistoricalInvoiceDoc extends ParsedGcpInvoice {
  importedAt: string;
}

/**
 * Saves an imported historical GCP invoice to Firestore under users/{userId}/gcp_billing_historical_invoices
 */
export async function saveGcpHistoricalInvoice(
  userId: string,
  invoice: ParsedGcpInvoice
): Promise<GcpHistoricalInvoiceDoc> {
  const { db } = getFirebaseAdmin();
  const docRef = db
    .collection("users")
    .doc(userId)
    .collection("gcp_billing_historical_invoices")
    .doc(invoice.invoiceMonth);

  const existingSnap = await docRef.get();
  let finalInvoice: ParsedGcpInvoice = { ...invoice };

  if (existingSnap.exists) {
    const existing = existingSnap.data() as GcpHistoricalInvoiceDoc;
    const existingInvoiceNumbers = (existing.invoiceNumber || "")
      .split(",")
      .map((s) => s.trim());

    if (!existingInvoiceNumbers.includes(invoice.invoiceNumber) && invoice.invoiceNumber) {
      // Merge two different invoices for the same billing month
      const mergedCost = Math.round((existing.cost + invoice.cost) * 100) / 100;
      const mergedCredits = Math.round((existing.credits + invoice.credits) * 100) / 100;
      const mergedTax = Math.round(((existing.tax || 0) + (invoice.tax || 0)) * 100) / 100;
      const mergedNetCost = Math.round((existing.netCost + invoice.netCost) * 100) / 100;

      // Merge services
      const servicesMap = new Map<string, { cost: number; credits: number; netCost: number }>();
      (existing.services || []).forEach((s) => {
        servicesMap.set(s.serviceName, { cost: s.cost, credits: s.credits, netCost: s.netCost });
      });
      (invoice.services || []).forEach((s) => {
        const prev = servicesMap.get(s.serviceName) || { cost: 0, credits: 0, netCost: 0 };
        servicesMap.set(s.serviceName, {
          cost: Math.round((prev.cost + s.cost) * 100) / 100,
          credits: Math.round((prev.credits + s.credits) * 100) / 100,
          netCost: Math.round((prev.netCost + s.netCost) * 100) / 100,
        });
      });

      // Merge projects
      const projectsMap = new Map<string, { cost: number; credits: number; netCost: number }>();
      (existing.projects || []).forEach((p) => {
        projectsMap.set(p.projectId, { cost: p.cost, credits: p.credits, netCost: p.netCost });
      });
      (invoice.projects || []).forEach((p) => {
        const prev = projectsMap.get(p.projectId) || { cost: 0, credits: 0, netCost: 0 };
        projectsMap.set(p.projectId, {
          cost: Math.round((prev.cost + p.cost) * 100) / 100,
          credits: Math.round((prev.credits + p.credits) * 100) / 100,
          netCost: Math.round((prev.netCost + p.netCost) * 100) / 100,
        });
      });

      const allSkus = [...(existing.topSkus || []), ...(invoice.topSkus || [])];
      allSkus.sort((a, b) => b.cost - a.cost);

      finalInvoice = {
        ...invoice,
        invoiceNumber: `${existing.invoiceNumber}, ${invoice.invoiceNumber}`,
        cost: mergedCost,
        credits: mergedCredits,
        tax: mergedTax,
        netCost: mergedNetCost,
        serviceCount: servicesMap.size,
        projectCount: projectsMap.size,
        services: Array.from(servicesMap.entries()).map(([k, v]) => ({
          serviceName: k,
          cost: v.cost,
          credits: v.credits,
          netCost: v.netCost,
        })),
        projects: Array.from(projectsMap.entries()).map(([k, v]) => ({
          projectId: k,
          cost: v.cost,
          credits: v.credits,
          netCost: v.netCost,
        })),
        topSkus: allSkus.slice(0, 25),
      };
    }
  }

  const docData: GcpHistoricalInvoiceDoc = {
    ...finalInvoice,
    importedAt: new Date().toISOString(),
  };

  await docRef.set(docData, { merge: true });
  return docData;
}

/**
 * Retrieves all imported historical invoices for a user
 */
export async function getGcpHistoricalInvoices(
  userId: string
): Promise<GcpHistoricalInvoiceDoc[]> {
  const { db } = getFirebaseAdmin();

  // Also check candidate user IDs if userId contains dots or underscores
  const candidateIds = Array.from(
    new Set([
      userId,
      userId.replace(/[^a-zA-Z0-9_-]/g, "_"),
      userId.replace(/_/g, "."),
      "default_user",
    ])
  );

  for (const uid of candidateIds) {
    const snap = await db
      .collection("users")
      .doc(uid)
      .collection("gcp_billing_historical_invoices")
      .orderBy("invoiceMonth", "asc")
      .get();

    if (!snap.empty) {
      return snap.docs.map((d) => d.data() as GcpHistoricalInvoiceDoc);
    }
  }

  return [];
}

/**
 * Deletes an imported historical invoice
 */
export async function deleteGcpHistoricalInvoice(
  userId: string,
  invoiceMonth: string
): Promise<boolean> {
  const { db } = getFirebaseAdmin();
  const docRef = db
    .collection("users")
    .doc(userId)
    .collection("gcp_billing_historical_invoices")
    .doc(invoiceMonth);

  await docRef.delete();
  return true;
}
