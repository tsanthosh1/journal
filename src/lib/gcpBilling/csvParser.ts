/**
 * Parser for Google Cloud Billing "Cost table" CSV export
 */

export interface ParsedGcpInvoice {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  billingAccountId: string;
  invoiceMonth: string; // e.g. "202608"
  formattedMonth: string; // e.g. "Aug 2026"
  currency: string;
  cost: number;
  credits: number;
  tax: number;
  netCost: number;
  serviceCount: number;
  projectCount: number;
  status: "BILLED";
  services: Array<{
    serviceName: string;
    cost: number;
    credits: number;
    netCost: number;
  }>;
  projects: Array<{
    projectId: string;
    cost: number;
    credits: number;
    netCost: number;
  }>;
  topSkus: Array<{
    skuId: string;
    description: string;
    serviceName: string;
    projectId: string;
    usageAmount: number;
    usageUnit: string;
    cost: number;
    credits: number;
    netCost: number;
  }>;
}

export function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseGcpCostTableCsv(csvContent: string): ParsedGcpInvoice {
  const lines = csvContent.split("\n");
  let invoiceNumber = "";
  let invoiceDate = "";
  let dueDate = "";
  let billingAccountId = "";
  let currency = "INR";
  let totalDue = 0;
  let headerLineIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("Invoice number,")) {
      invoiceNumber = line.split(",")[1]?.trim() || "";
    } else if (line.startsWith("Invoice date,")) {
      invoiceDate = line.split(",")[1]?.trim() || "";
    } else if (line.startsWith("Due date,")) {
      dueDate = line.split(",")[1]?.trim() || "";
    } else if (line.startsWith("Billing account ID,")) {
      billingAccountId = line.split(",")[1]?.trim() || "";
    } else if (line.startsWith("Currency,")) {
      currency = line.split(",")[1]?.trim() || "INR";
    } else if (line.startsWith("Total amount due,")) {
      const rawRest = line.slice("Total amount due,".length);
      const raw = rawRest.replace(/[^0-9.]/g, "");
      totalDue = parseFloat(raw) || 0;
    } else if (line.startsWith("Billing account name,Billing account ID,")) {
      headerLineIndex = i;
      break;
    }
  }

  const invoiceMonth = invoiceDate ? invoiceDate.slice(0, 7).replace("-", "") : "";
  const year = invoiceDate ? invoiceDate.slice(0, 4) : "";
  const monthNum = invoiceDate ? parseInt(invoiceDate.slice(5, 7), 10) - 1 : 0;
  const dateObj = new Date(parseInt(year, 10), monthNum, 1);
  const formattedMonth = dateObj.toLocaleDateString("en-US", { month: "short", year: "numeric" });

  let grossUsage = 0;
  let credits = 0;
  let tax = 0;

  const servicesMap = new Map<string, { cost: number; credits: number; netCost: number }>();
  const projectsMap = new Map<string, { cost: number; credits: number; netCost: number }>();
  const skusList: Array<{
    skuId: string;
    description: string;
    serviceName: string;
    projectId: string;
    usageAmount: number;
    usageUnit: string;
    cost: number;
    credits: number;
    netCost: number;
  }> = [];

  if (headerLineIndex !== -1) {
    for (let i = headerLineIndex + 1; i < lines.length; i++) {
      const row = lines[i].trim();
      if (!row) continue;
      const cols = splitCsvLine(row);
      if (cols.length < 18) continue;

      const projectName = cols[2];
      const projectId = cols[3];
      const serviceName = cols[5];
      const skuDescription = cols[7];
      const skuId = cols[8];
      const creditType = cols[10];
      const costType = cols[11];
      const usageAmount = parseFloat(cols[14]?.replace(/,/g, "") || "0") || 0;
      const usageUnit = cols[15] || "";
      const cost = parseFloat(cols[17]?.replace(/,/g, "") || "0") || 0;

      if (costType === "Usage") {
        if (creditType) {
          credits += Math.abs(cost);
        } else {
          grossUsage += cost;
        }

        if (serviceName) {
          const prev = servicesMap.get(serviceName) || { cost: 0, credits: 0, netCost: 0 };
          if (creditType) prev.credits += Math.abs(cost);
          else prev.cost += cost;
          prev.netCost = prev.cost - prev.credits;
          servicesMap.set(serviceName, prev);
        }

        if (projectId) {
          const prev = projectsMap.get(projectId) || { cost: 0, credits: 0, netCost: 0 };
          if (creditType) prev.credits += Math.abs(cost);
          else prev.cost += cost;
          prev.netCost = prev.cost - prev.credits;
          projectsMap.set(projectId, prev);
        }

        if (!creditType && skuDescription) {
          skusList.push({
            skuId,
            description: skuDescription,
            serviceName,
            projectId,
            usageAmount,
            usageUnit,
            cost: Math.round(cost * 100) / 100,
            credits: 0,
            netCost: Math.round(cost * 100) / 100,
          });
        }
      } else if (costType === "Tax") {
        tax += cost;
      }
    }
  }

  const netCost = totalDue > 0 ? totalDue : (grossUsage - credits + tax);

  return {
    invoiceNumber,
    invoiceDate,
    dueDate,
    billingAccountId,
    invoiceMonth,
    formattedMonth,
    currency,
    cost: Math.round(grossUsage * 100) / 100,
    credits: Math.round(credits * 100) / 100,
    tax: Math.round(tax * 100) / 100,
    netCost: Math.round(netCost * 100) / 100,
    serviceCount: servicesMap.size,
    projectCount: projectsMap.size,
    status: "BILLED",
    services: Array.from(servicesMap.entries()).map(([k, v]) => ({
      serviceName: k,
      cost: Math.round(v.cost * 100) / 100,
      credits: Math.round(v.credits * 100) / 100,
      netCost: Math.round(v.netCost * 100) / 100,
    })),
    projects: Array.from(projectsMap.entries()).map(([k, v]) => ({
      projectId: k,
      cost: Math.round(v.cost * 100) / 100,
      credits: Math.round(v.credits * 100) / 100,
      netCost: Math.round(v.netCost * 100) / 100,
    })),
    topSkus: skusList.sort((a, b) => b.cost - a.cost).slice(0, 20),
  };
}
