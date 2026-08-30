import { NextRequest, NextResponse } from "next/server";

interface ImageSearchResult {
  url: string;
  title: string;
  source: string;
  domain?: string;
}

// Popular service name to official domain mapping
const KNOWN_BRAND_DOMAINS: Record<string, { domain: string; title: string }> = {
  grt: { domain: "grtjewels.com", title: "GRT Jewellers" },
  "grt jewellers": { domain: "grtjewels.com", title: "GRT Jewellers" },
  "grt gold": { domain: "grtjewels.com", title: "GRT Jewellers" },
  "grt jps": { domain: "grtjewels.com", title: "GRT Jewellers" },
  tanishq: { domain: "tanishq.co.in", title: "Tanishq" },
  "golden harvest": { domain: "tanishq.co.in", title: "Tanishq Golden Harvest" },
  kalyan: { domain: "kalyanjewellers.net", title: "Kalyan Jewellers" },
  joyalukkas: { domain: "joyalukkas.com", title: "Joyalukkas" },
  "jos alukkas": { domain: "josalukkasonline.com", title: "Jos Alukkas" },
  airtel: { domain: "airtel.in", title: "Airtel" },
  "airtel xstream": { domain: "airtel.in", title: "Airtel Xstream" },
  "airtel broadband": { domain: "airtel.in", title: "Airtel Broadband" },
  jio: { domain: "jio.com", title: "Jio" },
  "jio fiber": { domain: "jio.com", title: "JioFiber" },
  netflix: { domain: "netflix.com", title: "Netflix" },
  spotify: { domain: "spotify.com", title: "Spotify" },
  "amazon prime": { domain: "primevideo.com", title: "Amazon Prime Video" },
  amazon: { domain: "amazon.in", title: "Amazon" },
  "amazon pay": { domain: "amazon.in", title: "Amazon Pay" },
  hotstar: { domain: "hotstar.com", title: "Disney+ Hotstar" },
  "disney hotstar": { domain: "hotstar.com", title: "Disney+ Hotstar" },
  youtube: { domain: "youtube.com", title: "YouTube Premium" },
  "youtube premium": { domain: "youtube.com", title: "YouTube Premium" },
  apple: { domain: "apple.com", title: "Apple" },
  "apple music": { domain: "music.apple.com", title: "Apple Music" },
  "apple tv": { domain: "tv.apple.com", title: "Apple TV+" },
  "apple icloud": { domain: "icloud.com", title: "Apple iCloud" },
  icloud: { domain: "icloud.com", title: "Apple iCloud" },
  "google one": { domain: "one.google.com", title: "Google One" },
  google: { domain: "google.com", title: "Google" },
  hdfc: { domain: "hdfcbank.com", title: "HDFC Bank" },
  "hdfc bank": { domain: "hdfcbank.com", title: "HDFC Bank" },
  "hdfc credit card": { domain: "hdfcbank.com", title: "HDFC Bank Credit Card" },
  axis: { domain: "axisbank.com", title: "Axis Bank" },
  "axis bank": { domain: "axisbank.com", title: "Axis Bank" },
  icici: { domain: "icicibank.com", title: "ICICI Bank" },
  "icici bank": { domain: "icicibank.com", title: "ICICI Bank" },
  sbi: { domain: "sbicard.com", title: "SBI Card" },
  "sbi card": { domain: "sbicard.com", title: "SBI Card" },
  "state bank of india": { domain: "sbi.co.in", title: "State Bank of India" },
  bescom: { domain: "bescom.karnataka.gov.in", title: "BESCOM" },
  electricity: { domain: "bescom.karnataka.gov.in", title: "Electricity Bill" },
  swiggy: { domain: "swiggy.com", title: "Swiggy One" },
  zomato: { domain: "zomato.com", title: "Zomato Gold" },
  github: { domain: "github.com", title: "GitHub" },
  chatgpt: { domain: "openai.com", title: "ChatGPT Plus" },
  openai: { domain: "openai.com", title: "OpenAI" },
  cultfit: { domain: "cult.fit", title: "Cult.fit" },
  "cult.fit": { domain: "cult.fit", title: "Cult.fit" },
  tataplay: { domain: "tataplay.com", title: "Tata Play" },
  "tata play": { domain: "tataplay.com", title: "Tata Play" },
  "flex pay": { domain: "amazon.in", title: "Amazon Flex Pay" },
  flexpay: { domain: "amazon.in", title: "Amazon Flex Pay" },
};

// Helper: Check if an image URL is alive with a fast HEAD request
async function isUrlAlive(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = (searchParams.get("q") || "").trim().toLowerCase();

    if (!query) {
      const defaultList: ImageSearchResult[] = [
        { url: "https://logo.clearbit.com/netflix.com", title: "Netflix", source: "Clearbit", domain: "netflix.com" },
        { url: "https://logo.clearbit.com/spotify.com", title: "Spotify", source: "Clearbit", domain: "spotify.com" },
        { url: "https://logo.clearbit.com/primevideo.com", title: "Amazon Prime", source: "Clearbit", domain: "primevideo.com" },
        { url: "https://logo.clearbit.com/airtel.in", title: "Airtel", source: "Clearbit", domain: "airtel.in" },
        { url: "https://logo.clearbit.com/grtjewels.com", title: "GRT Jewellers", source: "Clearbit", domain: "grtjewels.com" },
        { url: "https://logo.clearbit.com/tanishq.co.in", title: "Tanishq", source: "Clearbit", domain: "tanishq.co.in" },
        { url: "https://logo.clearbit.com/hdfcbank.com", title: "HDFC Bank", source: "Clearbit", domain: "hdfcbank.com" },
        { url: "https://logo.clearbit.com/axisbank.com", title: "Axis Bank", source: "Clearbit", domain: "axisbank.com" },
        { url: "https://logo.clearbit.com/icicibank.com", title: "ICICI Bank", source: "Clearbit", domain: "icicibank.com" },
        { url: "https://logo.clearbit.com/sbicard.com", title: "SBI Card", source: "Clearbit", domain: "sbicard.com" },
        { url: "https://logo.clearbit.com/swiggy.com", title: "Swiggy", source: "Clearbit", domain: "swiggy.com" },
        { url: "https://logo.clearbit.com/zomato.com", title: "Zomato", source: "Clearbit", domain: "zomato.com" },
      ];
      return NextResponse.json({ success: true, results: defaultList });
    }

    const candidateResults: ImageSearchResult[] = [];
    const seenUrls = new Set<string>();

    // 1. Direct Domain Match from Known Brands Dictionary
    for (const [key, val] of Object.entries(KNOWN_BRAND_DOMAINS)) {
      if (query.includes(key) || key.includes(query)) {
        const clearbitUrl = `https://logo.clearbit.com/${val.domain}`;
        const googleFaviconUrl = `https://www.google.com/s2/favicons?domain=${val.domain}&sz=256`;
        const duckduckgoUrl = `https://icons.duckduckgo.com/ip3/${val.domain}.ico`;

        if (!seenUrls.has(clearbitUrl)) {
          candidateResults.push({ url: clearbitUrl, title: `${val.title} (Logo)`, source: "Clearbit", domain: val.domain });
          seenUrls.add(clearbitUrl);
        }
        if (!seenUrls.has(googleFaviconUrl)) {
          candidateResults.push({ url: googleFaviconUrl, title: `${val.title} (Icon)`, source: "Google", domain: val.domain });
          seenUrls.add(googleFaviconUrl);
        }
        if (!seenUrls.has(duckduckgoUrl)) {
          candidateResults.push({ url: duckduckgoUrl, title: `${val.title} (Favicon)`, source: "DuckDuckGo", domain: val.domain });
          seenUrls.add(duckduckgoUrl);
        }
        break;
      }
    }

    // 2. Search Wikimedia Commons for high-res vector and PNG logos
    try {
      const wikiQuery = encodeURIComponent(`${query} logo`);
      const wikiUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${wikiQuery}&gsrnamespace=6&gsrlimit=10&prop=imageinfo&iiprop=url|mime&iiurlwidth=256&format=json&origin=*`;
      const wikiRes = await fetch(wikiUrl, { signal: AbortSignal.timeout(2500) });
      if (wikiRes.ok) {
        const wikiData = await wikiRes.json();
        const pages = wikiData?.query?.pages || {};
        for (const p of Object.values(pages) as Array<{ title?: string; imageinfo?: Array<{ thumburl?: string; url?: string }> }>) {
          const img = p.imageinfo?.[0];
          const bestUrl = img?.thumburl || img?.url;
          if (bestUrl && !seenUrls.has(bestUrl)) {
            candidateResults.push({
              url: bestUrl,
              title: (p.title || query).replace(/^File:/, "").replace(/\.[^/.]+$/, ""),
              source: "Wikimedia",
            });
            seenUrls.add(bestUrl);
          }
        }
      }
    } catch {
      // Wikimedia fallback
    }

    // 3. Fallback to DuckDuckGo domain favicon if query looks like a service/brand
    const cleanWord = query.replace(/[^a-zA-Z0-9]/g, "");
    if (cleanWord && candidateResults.length < 3) {
      const dom = `${cleanWord}.com`;
      const gUrl = `https://www.google.com/s2/favicons?domain=${dom}&sz=256`;
      const cUrl = `https://logo.clearbit.com/${dom}`;
      if (!seenUrls.has(cUrl)) {
        candidateResults.push({ url: cUrl, title: `${query} (${dom})`, source: "Clearbit", domain: dom });
        seenUrls.add(cUrl);
      }
      if (!seenUrls.has(gUrl)) {
        candidateResults.push({ url: gUrl, title: `${query} Icon`, source: "Google", domain: dom });
        seenUrls.add(gUrl);
      }
    }

    // 4. Validate candidates so only WORKING (HTTP 200) images are returned
    const validResults: ImageSearchResult[] = [];
    const checkPromises = candidateResults.map(async (candidate) => {
      // Google Favicon and Wikimedia thumb URLs are almost always alive; Clearbit often 404s for unknown domains
      if (candidate.source === "Clearbit") {
        const alive = await isUrlAlive(candidate.url);
        if (alive) validResults.push(candidate);
      } else {
        validResults.push(candidate);
      }
    });

    await Promise.all(checkPromises);

    return NextResponse.json({ success: true, results: validResults });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: (err as Error).message || "Failed to search images." },
      { status: 500 },
    );
  }
}
