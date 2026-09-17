import { getFirebaseAdmin } from "@/lib/firebaseAdmin";
import { getValidGmailToken } from "@/lib/gmail/oauth";
import {
  getGmailMessageDetails,
  searchGmailMessages,
} from "@/lib/gmail/apiClient";
import { parseInstamartEmail } from "./parser";
import {
  batchSaveInstamartOrders,
  getExistingInstamartOrderIds,
} from "./storage";
import { InstamartOrder, InstamartSyncProgress } from "./types";

const INSTAMART_QUERY = 'subject:("Instamart order" OR "Swiggy Instamart") delivered';

export interface SyncInstamartOptions {
  maxResults?: number;
  fullSync?: boolean;
}

/**
 * Searches Gmail with pagination to fetch all matching message summaries
 */
async function searchAllGmailMessages(
  accessToken: string,
  query: string,
  maxTotal = 500
): Promise<Array<{ id: string; threadId: string }>> {
  const allMessages: Array<{ id: string; threadId: string }> = [];
  let pageToken: string | undefined = undefined;

  do {
    const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    url.searchParams.set("q", query);
    url.searchParams.set("maxResults", Math.min(maxTotal - allMessages.length, 500).toString());
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
 * Synchronizes Instamart orders from connected Gmail into Firestore
 */
export async function syncInstamartOrders(
  userId: string,
  options: SyncInstamartOptions = {}
): Promise<InstamartSyncProgress> {
  // 1. Retrieve user's stored Gmail OAuth token using unified token resolver
  const tokenRecord = await getValidGmailToken(userId);

  if (!tokenRecord || !tokenRecord.accessToken) {
    throw new Error(
      "Gmail is not connected or offline refresh token is missing. Please connect Gmail in top bar."
    );
  }

  const accessToken = tokenRecord.accessToken;
  const canonicalUserId = tokenRecord.email || userId;

  // 2. Search messages in Gmail
  const maxToFetch = options.fullSync ? 500 : options.maxResults || 25;
  const messageSummaries = await searchAllGmailMessages(
    accessToken,
    INSTAMART_QUERY,
    maxToFetch
  );

  // 4. Retrieve existing order IDs and message IDs from Firestore to deduplicate
  const { orderIds, messageIds } = await getExistingInstamartOrderIds(canonicalUserId);

  // Filter only new message summaries
  const pendingMessages = messageSummaries.filter((m) => !messageIds.has(m.id));
  let skippedExisting = messageSummaries.length - pendingMessages.length;

  let newlySynced = 0;
  let errors = 0;
  const parsedOrders: InstamartOrder[] = [];

  // 5. Fetch and parse new messages in small rate-limited batches
  const BATCH_SIZE = 8;
  for (let i = 0; i < pendingMessages.length; i += BATCH_SIZE) {
    const batch = pendingMessages.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.allSettled(
      batch.map(async (m) => {
        let details: any = null;
        let attempts = 0;

        while (attempts < 2) {
          try {
            details = await getGmailMessageDetails(accessToken, m.id);
            break;
          } catch (err: any) {
            attempts++;
            if (err?.message?.includes("403") || err?.message?.includes("429")) {
              // Rate limit backoff: wait 1.5 seconds and retry
              await new Promise((r) => setTimeout(r, 1500));
            } else {
              throw err;
            }
          }
        }

        if (!details) return null;

        return parseInstamartEmail({
          userId: canonicalUserId,
          messageId: m.id,
          subject: details.subject,
          from: details.from,
          emailDate: details.date,
          internalDate: details.internalDate,
          bodyHtml: details.bodyHtml,
          bodyText: details.bodyText,
        });
      })
    );

    for (const res of batchResults) {
      if (res.status === "fulfilled" && res.value) {
        const order = res.value;
        if (!orderIds.has(order.id)) {
          orderIds.add(order.id);
          parsedOrders.push(order);
          newlySynced++;
        } else {
          skippedExisting++;
        }
      } else {
        errors++;
      }
    }

    // Small polite throttle between batches (250ms)
    if (i + BATCH_SIZE < pendingMessages.length) {
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  // 6. Batch save parsed orders to Firestore
  if (parsedOrders.length > 0) {
    await batchSaveInstamartOrders(canonicalUserId, parsedOrders);
  }

  return {
    totalFound: messageSummaries.length,
    processed: pendingMessages.length,
    newlySynced,
    skippedExisting,
    errors,
    isComplete: true,
    statusMessage: `Successfully synced ${newlySynced} new orders (${skippedExisting} previously archived).`,
  };
}
