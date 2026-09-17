import { getValidGmailToken } from "@/lib/gmail/oauth";
import {
  getGmailMessageDetails,
} from "@/lib/gmail/apiClient";
import { parseSwiggyEmail } from "./parser";
import {
  batchSaveSwiggyOrders,
  getExistingSwiggyOrderIds,
} from "./storage";
import { SwiggyOrder, SwiggySyncProgress } from "./types";

const SWIGGY_QUERY = 'subject:("your swiggy order" OR "Swiggy order") -Instamart';

export interface SyncSwiggyOptions {
  maxResults?: number;
  fullSync?: boolean;
}

/**
 * Searches Gmail with pagination to fetch all matching message summaries
 */
async function searchAllGmailMessages(
  accessToken: string,
  query: string,
  maxTotal = 800
): Promise<Array<{ id: string; threadId: string }>> {
  const allMessages: Array<{ id: string; threadId: string }> = [];
  let pageToken: string | undefined = undefined;

  do {
    const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    url.searchParams.set("q", query);
    url.searchParams.set(
      "maxResults",
      Math.min(maxTotal - allMessages.length, 500).toString()
    );
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gmail search error (${res.status}): ${err}`);
    }

    const data = await res.json();
    if (data.messages && Array.isArray(data.messages)) {
      allMessages.push(...data.messages);
    }

    pageToken = data.nextPageToken;
  } while (pageToken && allMessages.length < maxTotal);

  return allMessages;
}

/**
 * Synchronizes Swiggy food delivery orders from connected Gmail into Firestore
 */
export async function syncSwiggyOrders(
  userId: string,
  options: SyncSwiggyOptions = {}
): Promise<SwiggySyncProgress> {
  const tokenRecord = await getValidGmailToken(userId);

  if (!tokenRecord || !tokenRecord.accessToken) {
    throw new Error(
      "Gmail is not connected or offline refresh token is missing. Please connect Gmail in top bar."
    );
  }

  const accessToken = tokenRecord.accessToken;
  const maxResults = options.maxResults || (options.fullSync ? 800 : 50);

  // 1. Fetch matching messages from Gmail
  const messageSummaries = await searchAllGmailMessages(
    accessToken,
    SWIGGY_QUERY,
    maxResults
  );

  if (messageSummaries.length === 0) {
    return {
      totalFound: 0,
      processed: 0,
      newlySynced: 0,
      skippedExisting: 0,
      errors: 0,
      isComplete: true,
      statusMessage: "No Swiggy food delivery order emails found in Gmail.",
    };
  }

  // 2. Fetch existing stored order IDs & message IDs
  const { orderIds: existingOrderIds, messageIds: existingMessageIds } =
    await getExistingSwiggyOrderIds(userId);

  const newOrdersToSave: SwiggyOrder[] = [];
  let skippedExisting = 0;
  let errors = 0;

  // 3. Process messages
  for (let i = 0; i < messageSummaries.length; i++) {
    const summary = messageSummaries[i];

    if (!options.fullSync && existingMessageIds.has(summary.id)) {
      skippedExisting++;
      continue;
    }

    try {
      const detail = await getGmailMessageDetails(accessToken, summary.id);

      const parsedOrder = parseSwiggyEmail({
        userId,
        messageId: summary.id,
        subject: detail.subject,
        emailDate: detail.date,
        internalDate: detail.internalDate,
        bodyHtml: detail.bodyHtml,
        bodyText: detail.bodyText,
      });

      if (!parsedOrder) {
        skippedExisting++;
        continue;
      }

      if (existingOrderIds.has(parsedOrder.orderId) && !options.fullSync) {
        skippedExisting++;
        continue;
      }

      newOrdersToSave.push(parsedOrder);
      existingOrderIds.add(parsedOrder.orderId);
      existingMessageIds.add(summary.id);

      // Brief delay to prevent hitting Google rate limits on large batches
      if (i % 15 === 0 && i > 0) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    } catch (err) {
      console.warn(
        `Failed to parse Swiggy order email ${summary.id}:`,
        err
      );
      errors++;
    }
  }

  // 4. Batch save newly parsed orders to Firestore
  let newlySynced = 0;
  if (newOrdersToSave.length > 0) {
    newlySynced = await batchSaveSwiggyOrders(userId, newOrdersToSave);
  }

  return {
    totalFound: messageSummaries.length,
    processed: messageSummaries.length,
    newlySynced,
    skippedExisting,
    errors,
    isComplete: true,
    statusMessage: `Sync complete! Synced ${newlySynced} new Swiggy food order(s). ${skippedExisting} already existed.`,
  };
}
