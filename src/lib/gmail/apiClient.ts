const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export interface GmailMessageSummary {
  id: string;
  threadId: string;
}

export interface GmailMessageDetail {
  id: string;
  threadId: string;
  snippet: string;
  internalDate: string; // ms timestamp as string
  subject: string;
  from: string;
  to: string;
  date: string;
  bodyText: string;
  bodyHtml: string;
}

/**
 * Searches Gmail messages matching a specific Gmail query syntax
 */
export async function searchGmailMessages(
  accessToken: string,
  query: string,
  maxResults = 10,
): Promise<GmailMessageSummary[]> {
  if (!query.trim()) return [];

  const url = new URL(`${GMAIL_API_BASE}/messages`);
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", maxResults.toString());

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gmail search error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.messages || [];
}

/**
 * Fetches and decodes full message details including headers and body text
 */
export async function getGmailMessageDetails(
  accessToken: string,
  messageId: string,
): Promise<GmailMessageDetail> {
  const url = `${GMAIL_API_BASE}/messages/${messageId}?format=full`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Gmail get message error (${response.status}) for id ${messageId}: ${errorText}`,
    );
  }

  const data = await response.json();

  let subject = "";
  let from = "";
  let to = "";
  let date = "";

  const headers = data.payload?.headers || [];
  for (const h of headers) {
    const name = h.name.toLowerCase();
    if (name === "subject") subject = h.value;
    else if (name === "from") from = h.value;
    else if (name === "to") to = h.value;
    else if (name === "date") date = h.value;
  }

  const { bodyText, bodyHtml } = extractBodyFromPayload(data.payload);

  return {
    id: data.id,
    threadId: data.threadId,
    snippet: data.snippet || "",
    internalDate: data.internalDate || "",
    subject,
    from,
    to,
    date,
    bodyText,
    bodyHtml,
  };
}

/**
 * Helper to recursively extract and decode plain text and HTML from MIME payload
 */
function extractBodyFromPayload(payload: any): { bodyText: string; bodyHtml: string } {
  let bodyText = "";
  let bodyHtml = "";

  if (!payload) return { bodyText, bodyHtml };

  if (payload.body?.data) {
    const decoded = decodeBase64Url(payload.body.data);
    const mimeType = payload.mimeType || "";
    if (mimeType.includes("text/html")) {
      bodyHtml += decoded;
    } else {
      bodyText += decoded;
    }
  }

  if (payload.parts && Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      const partResult = extractBodyFromPayload(part);
      if (partResult.bodyText) bodyText += `\n${partResult.bodyText}`;
      if (partResult.bodyHtml) bodyHtml += `\n${partResult.bodyHtml}`;
    }
  }

  return { bodyText: bodyText.trim(), bodyHtml: bodyHtml.trim() };
}

/**
 * Decodes base64url encoded strings from Gmail API
 */
function decodeBase64Url(input: string): string {
  try {
    let base64 = input.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) {
      base64 += "=";
    }
    return Buffer.from(base64, "base64").toString("utf8");
  } catch {
    return "";
  }
}
