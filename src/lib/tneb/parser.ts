import * as cheerio from "cheerio";
import { TnebBillRecord, TnebConsumerAccount, TnebSlabRate } from "./types";

/**
 * Decodes quoted-printable string if parsed from .mhtml email / web archive
 */
export function decodeQuotedPrintable(str: string): string {
  if (!str.includes("=3D") && !str.includes("=\n") && !str.includes("=\r\n")) {
    return str;
  }
  return str
    .replace(/=(?:\r\n|\r|\n)/g, "")
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Converts DD/MM/YYYY to YYYY-MM-DD
 */
export function parseTnebDateToIso(dateStr: string): string | undefined {
  if (!dateStr) return undefined;
  const clean = dateStr.trim().replace(/^&nbsp;/i, "").replace(/[^0-9/]/g, "");
  const parts = clean.split("/");
  if (parts.length === 3) {
    const day = parts[0].padStart(2, "0");
    const month = parts[1].padStart(2, "0");
    const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
    return `${year}-${month}-${day}`;
  }
  return undefined;
}

export function parseNumber(val: any): number {
  if (typeof val === "number") return val;
  if (!val) return 0;
  const clean = String(val).replace(/,/g, "").trim();
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

/**
 * Extracts all TNEB account metadata, slab rates, and bi-monthly billing history from detconws.php HTML
 */
export function parseTnebServiceDetailsHtml(rawHtml: string): {
  account: TnebConsumerAccount;
  bills: TnebBillRecord[];
} {
  const html = decodeQuotedPrintable(rawHtml);
  const $ = cheerio.load(html);

  // 1. Extract Consumer Name & Number from top summary banner
  let consumerName = "";
  let consumerNumber = "";

  const pageText = $("body").text();

  $("tr").each((_, tr) => {
    const text = $(tr).text();
    if (text.includes("CONSUMER NAME") && text.includes("CONSUMER NUMBER")) {
      const matchName = text.match(/CONSUMER\s*NAME\s*[:]\s*([^CONSUMER]+)/i);
      if (matchName) consumerName = matchName[1].trim();

      const matchNum = text.match(/CONSUMER\s*NUMBER\s*[:\s]*(\d+)/i);
      if (matchNum) consumerNumber = matchNum[1].trim();
    }
  });

  if (!consumerNumber) {
    const matchNum = pageText.match(/CONSUMER\s*NUMBER\s*[:\s]*(\d{9,15})/i);
    if (matchNum) consumerNumber = matchNum[1].trim();
  }
  if (!consumerName) {
    const matchName = pageText.match(/CONSUMER\s*NAME\s*[:\s]*([A-Z0-9.\s]+)/i);
    if (matchName) consumerName = matchName[1].split("\n")[0].trim();
  }

  // 2. Metadata Field Mapping Helper
  const getFieldValue = (label: string): string => {
    let result = "";
    $("th, td").each((_, el) => {
      const t = $(el).text().trim().toUpperCase();
      if (t === label.toUpperCase() || t.startsWith(label.toUpperCase())) {
        const next = $(el).next("td, th");
        if (next.length > 0) {
          result = next.text().trim();
        }
      }
    });
    return result;
  };

  const region = getFieldValue("REGION") || "";
  const phase = getFieldValue("PHASE") || "";
  const circle = getFieldValue("CIRCLE") || "";
  const sanctionedLoad = getFieldValue("SANCTIONED LOAD") || "";
  const section = getFieldValue("SECTION") || "";
  const distribution = getFieldValue("DISTRIBUTION") || "";
  const meterNumber = getFieldValue("METER NUMBER") || "";
  const serviceNumber = getFieldValue("SERVICE NUMBER") || "";
  const accdAsOnDate = getFieldValue("ACCD* AS ON Date") || getFieldValue("ACCD") || "";
  const address = getFieldValue("ADDRESS") || "";
  const mcdAsOnDate = getFieldValue("MCD AS ON Date") || getFieldValue("MCD") || "";
  const serviceStatus = getFieldValue("SERVICE STATUS") || "LIVE";
  const serviceCategory = getFieldValue("SERVICE CATEGORY") || "";
  const tariffCode = getFieldValue("TARIFF CODE") || "";
  const panNumber = getFieldValue("PAN Number") || "";

  // Section hover title
  let sectionAddress = "";
  $("span[title*='Address :']").each((_, el) => {
    sectionAddress = $(el).attr("title") || "";
  });

  // Dues to be paid
  let duesToBePaid: string | number = "NIL";
  let hasDue = false;
  const dueMatch = pageText.match(/DUES\s*TO\s*BE\s*PAID\s*IS\s*["']?([^"'\r\n<]+)["']?/i);
  if (dueMatch) {
    const rawDue = dueMatch[1].trim();
    if (rawDue.toUpperCase() === "NIL" || rawDue === "0" || rawDue === "0.00") {
      duesToBePaid = "NIL";
      hasDue = false;
    } else {
      const numDue = parseNumber(rawDue);
      duesToBePaid = numDue > 0 ? numDue : rawDue;
      hasDue = numDue > 0;
    }
  }

  // 3. Extract Slab Rates Table
  const slabRates: TnebSlabRate[] = [];
  $("table.ccbills").each((_, tbl) => {
    const header = $(tbl).find("tr").first().text();
    if (header.includes("From Unit") && header.includes("To Unit") && header.includes("Rate")) {
      $(tbl).find("tr").each((idx, r) => {
        if (idx === 0) return; // skip header
        const tds = $(r).find("td");
        if (tds.length >= 4) {
          const fromUnit = parseNumber($(tds[0]).text());
          const toUnit = $(tds[1]).text().trim();
          const rateRs = parseNumber($(tds[2]).text());
          const maxUnit = $(tds[3]).text().trim();
          slabRates.push({
            fromUnit,
            toUnit: isNaN(Number(toUnit)) ? toUnit : Number(toUnit),
            rateRs,
            maxUnit: isNaN(Number(maxUnit)) ? maxUnit : Number(maxUnit),
          });
        }
      });
    }
  });

  // 4. Extract Historical Consumption & Collection Ledger Table
  const bills: TnebBillRecord[] = [];

  $("table.ccbills").each((_, tbl) => {
    const caption = $(tbl).find("caption").text();
    const isBillingTable =
      caption.includes("Consumption Charges") ||
      $(tbl).find("th").text().includes("Assessment") ||
      $(tbl).find("th").text().includes("Consumption Reading");

    if (isBillingTable) {
      $(tbl).find("tr").each((_, row) => {
        const tds = $(row).find("td");
        // Row 345 in sample has 22 <td> cells
        if (tds.length >= 18) {
          const rawAssess = $(tds[0]).text().trim();
          const isoAssess = parseTnebDateToIso(rawAssess);
          if (!isoAssess) return; // skip number header row (1, 2, 3...)

          const rawEntry = $(tds[1]).text().trim();
          const status = $(tds[2]).text().trim() || "NORMAL";
          const kwh = parseNumber($(tds[3]).text());
          const kvah = parseNumber($(tds[4]).text());
          const recordedDemand = parseNumber($(tds[5]).text());
          const powerFactor = $(tds[6]).text().trim();
          const unitsConsumed = parseNumber($(tds[7]).text());

          const ccChargesLink = $(tds[8]).find("a").first();
          const rawUrl = ccChargesLink.attr("href") || undefined;
          const ccCharges = parseNumber($(tds[8]).text());

          const electricityTax = parseNumber($(tds[9]).text());
          const weldingCharges = parseNumber($(tds[10]).text());
          const excessDemand = parseNumber($(tds[11]).text());
          const pfPenalty = parseNumber($(tds[12]).text());
          const fixedCharges = parseNumber($(tds[13]).text());
          const totalCharges = parseNumber($(tds[14]).text());

          const advanceAmountPaid = parseNumber($(tds[15]).text());
          const adjustment = parseNumber($(tds[16]).text());
          const amountToBePaid = parseNumber($(tds[17]).text());

          let rawDueDate = "";
          let isoDueDate: string | undefined = undefined;
          let amountPaid = 0;
          let receiptNo = "";
          let rawPaymentDate = "";
          let isoPaymentDate: string | undefined = undefined;

          if (tds.length >= 22) {
            rawDueDate = $(tds[18]).text().trim();
            isoDueDate = parseTnebDateToIso(rawDueDate);
            amountPaid = parseNumber($(tds[19]).text());
            receiptNo = $(tds[20]).text().split("<")[0].split(" ")[0].trim();
            rawPaymentDate = $(tds[21]).text().trim();
            isoPaymentDate = parseTnebDateToIso(rawPaymentDate);
          } else if (tds.length >= 20) {
            rawDueDate = $(tds[18]).text().trim();
            isoDueDate = parseTnebDateToIso(rawDueDate);
            amountPaid = parseNumber($(tds[19]).text());
          }

          const isPaid = amountPaid >= (amountToBePaid || totalCharges) && amountPaid > 0;
          const cycleMonth = isoAssess.slice(0, 7);

          const billId = `${consumerNumber}_${isoAssess}`;

          bills.push({
            id: billId,
            consumerNumber,
            assessmentDate: isoAssess,
            rawAssessmentDate: rawAssess,
            entryDate: parseTnebDateToIso(rawEntry),
            status,
            kwh,
            kvah,
            recordedDemand,
            powerFactor,
            unitsConsumed,
            ccCharges,
            electricityTax,
            weldingCharges,
            excessDemand,
            pfPenalty,
            fixedCharges,
            totalCharges,
            advanceAmountPaid,
            adjustment,
            amountToBePaid,
            dueDate: isoDueDate,
            rawDueDate,
            amountPaid,
            receiptNo,
            paymentDate: isoPaymentDate,
            rawPaymentDate,
            isPaid,
            rawUrl,
            cycleMonth,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      });
    }
  });

  // Sort bills chronologically descending (newest assessment first)
  bills.sort((a, b) => b.assessmentDate.localeCompare(a.assessmentDate));

  const totalUnits = bills.reduce((sum, b) => sum + (b.unitsConsumed || 0), 0);

  const account: TnebConsumerAccount = {
    consumerNumber: consumerNumber || "UNKNOWN",
    consumerName: consumerName || "UNKNOWN",
    region,
    phase,
    circle,
    sanctionedLoad,
    section,
    sectionAddress,
    distribution,
    meterNumber,
    serviceNumber,
    accdAsOnDate,
    address,
    mcdAsOnDate,
    serviceStatus,
    serviceCategory,
    tariffCode,
    panNumber,
    aadharLinked: !pageText.includes("Link your Aadhar"),
    duesToBePaid,
    hasDue,
    latestBill: bills.length > 0 ? bills[0] : undefined,
    billsCount: bills.length,
    totalUnitsConsumed: totalUnits,
    slabRates: slabRates.length > 0 ? slabRates : undefined,
    lastSyncedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  return { account, bills };
}
