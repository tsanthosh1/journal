import { stripHtmlAndCleanText } from "./parsers/base";

export interface EmlDocument {
  filename?: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  contentType: string;
  htmlBody: string;
  textBody: string;
  cleanText: string;
  rawEml: string;
  headers: Record<string, string>;
}

/**
 * Decodes RFC 2047 encoded words in email headers (e.g. =?UTF-8?B?...?= or =?UTF-8?Q?...?=)
 */
export function decodeMimeHeader(val: string): string {
  if (!val) return "";
  return val.replace(/=\?([^?]+)\?([BQbq])\?([^?]+)\?=/g, (_, charset, encoding, text) => {
    try {
      if (encoding.toUpperCase() === "B") {
        if (typeof Buffer !== "undefined") {
          return Buffer.from(text, "base64").toString((charset as BufferEncoding) || "utf8");
        } else if (typeof atob !== "undefined") {
          return decodeURIComponent(escape(atob(text)));
        }
      } else if (encoding.toUpperCase() === "Q") {
        const qDecoded = text
          .replace(/_/g, " ")
          .replace(/=([0-9A-Fa-f]{2})/g, (_m: string, hex: string) =>
            String.fromCharCode(parseInt(hex, 16)),
          );
        return qDecoded;
      }
    } catch {
      return text;
    }
    return text;
  });
}

/**
 * Decodes quoted-printable string
 */
export function decodeQuotedPrintable(str: string): string {
  return str
    .replace(/=3D/gi, "=")
    .replace(/=\r?\n/g, "")
    .replace(/=20/g, " ")
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Decodes base64 payload into utf-8 string safely
 */
export function decodeBase64Safe(b64: string): string {
  const clean = b64.replace(/[\r\n\s]/g, "");
  try {
    if (typeof Buffer !== "undefined") {
      return Buffer.from(clean, "base64").toString("utf8");
    } else if (typeof atob !== "undefined") {
      return decodeURIComponent(escape(atob(clean)));
    }
  } catch {
    try {
      if (typeof atob !== "undefined") return atob(clean);
    } catch {
      // ignore
    }
  }
  return clean;
}

/**
 * Recursively extracts text/html and text/plain parts from nested multipart MIME structures
 */
function extractMimeParts(
  body: string,
  contentType: string,
): { htmlBody: string; textBody: string } {
  let htmlBody = "";
  let textBody = "";

  const boundaryMatch = contentType.match(/boundary=["']?([^"';\s]+)["']?/i);
  if (boundaryMatch && boundaryMatch[1]) {
    const boundary = boundaryMatch[1];
    const parts = body.split(new RegExp(`--${boundary}(?:--)?`));

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed || trimmed === "--") continue;

      const partMatch = trimmed.match(/\r?\n\r?\n/);
      const partHeaders = partMatch ? trimmed.slice(0, partMatch.index) : "";
      let partBody = partMatch ? trimmed.slice((partMatch.index || 0) + partMatch[0].length) : trimmed;

      const isBase64 = /Content-Transfer-Encoding:\s*base64/i.test(partHeaders);
      const isQP = /Content-Transfer-Encoding:\s*quoted-printable/i.test(partHeaders);

      if (isBase64) {
        partBody = decodeBase64Safe(partBody);
      } else if (isQP) {
        partBody = decodeQuotedPrintable(partBody);
      }

      const partContentType = partHeaders.match(/Content-Type:\s*([^\r\n]+)/i)?.[1] || "";

      if (/multipart\//i.test(partContentType)) {
        const nested = extractMimeParts(partBody, partContentType);
        if (nested.htmlBody) htmlBody += (htmlBody ? "\n" : "") + nested.htmlBody;
        if (nested.textBody) textBody += (textBody ? "\n" : "") + nested.textBody;
      } else if (/text\/html/i.test(partContentType)) {
        htmlBody += (htmlBody ? "\n" : "") + partBody;
      } else if (/text\/plain/i.test(partContentType)) {
        textBody += (textBody ? "\n" : "") + partBody;
      }
    }
  } else {
    // Single part
    let decoded = body;
    if (/text\/html/i.test(contentType)) {
      htmlBody = decoded;
    } else {
      textBody = decoded;
    }
  }

  return { htmlBody, textBody };
}

/**
 * Parses a raw .eml / MIME message string into structured headers, HTML, and cleaned text
 */
export function parseEmlContent(rawEml: string, filename?: string): EmlDocument {
  if (!rawEml) {
    return {
      filename,
      subject: "",
      from: "",
      to: "",
      date: "",
      contentType: "",
      htmlBody: "",
      textBody: "",
      cleanText: "",
      rawEml: "",
      headers: {},
    };
  }

  // Split headers and body at the first blank line
  const match = rawEml.match(/\r?\n\r?\n/);
  const headerBlock = match ? rawEml.slice(0, match.index) : rawEml;
  const bodyBlock = match ? rawEml.slice((match.index || 0) + match[0].length) : "";

  // Parse headers with line unfolding (RFC 2822)
  const headers: Record<string, string> = {};
  const headerLines = headerBlock.split(/\r?\n/);
  let currentKey = "";

  for (const line of headerLines) {
    if (/^\s+[^\s]/.test(line) && currentKey) {
      headers[currentKey] += " " + line.trim();
    } else {
      const colonIdx = line.indexOf(":");
      if (colonIdx > 0) {
        currentKey = line.slice(0, colonIdx).trim().toLowerCase();
        const value = line.slice(colonIdx + 1).trim();
        headers[currentKey] = value;
      }
    }
  }

  const subject = decodeMimeHeader(headers["subject"] || "");
  const from = decodeMimeHeader(headers["from"] || "");
  const to = decodeMimeHeader(headers["to"] || "");
  const date = headers["date"] || "";
  const contentTypeHeader = headers["content-type"] || "text/plain";

  const { htmlBody, textBody } = extractMimeParts(bodyBlock, contentTypeHeader);

  // Generate fallback clean text
  const cleanContent = stripHtmlAndCleanText(htmlBody || textBody || bodyBlock);

  return {
    filename,
    subject,
    from,
    to,
    date,
    contentType: contentTypeHeader,
    htmlBody,
    textBody,
    cleanText: cleanContent,
    rawEml,
    headers,
  };
}
