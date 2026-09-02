import puppeteer, { Browser } from "puppeteer";
import { solveNumericCaptcha } from "./captchaSolver";
import { parseTnebServiceDetailsHtml } from "./parser";
import { getTnebConfig, saveTnebAccountAndBills } from "./storage";
import { TnebConsumerAccount, TnebScrapeOptions, TnebSyncResult, TnebTrackedConsumer } from "./types";

export type TnebLogCallback = (level: "info" | "warn" | "error" | "success", message: string, details?: any) => void;

/**
 * Automates logging in to the TNEB web portal, solving the numeric captcha,
 * navigating consumer accounts, and parsing bi-monthly service details.
 */
export async function scrapeAndSyncTneb(
  options: TnebScrapeOptions = {},
  onLog?: TnebLogCallback,
): Promise<TnebSyncResult> {
  const logs: string[] = [];
  const errors: string[] = [];
  const accounts: TnebConsumerAccount[] = [];
  let totalBillsProcessed = 0;

  const log = (level: "info" | "warn" | "error" | "success", msg: string, details?: any) => {
    logs.push(`[${level.toUpperCase()}] ${msg}`);
    if (onLog) {
      onLog(level, msg, details);
    }
  };

  const username = options.username || process.env.TNEB_USERNAME;
  const password = options.password || process.env.TNEB_PASSWORD;

  if (!username || !password) {
    const err = "TNEB Credentials Missing: Please provide username and password via environment variables (TNEB_USERNAME, TNEB_PASSWORD) or request payload.";
    log("error", err);
    errors.push(err);
    return {
      success: false,
      accountsProcessed: 0,
      billsProcessed: 0,
      accounts: [],
      errors,
      logs,
    };
  }

  const savedConfig = await getTnebConfig();
  const targetConsumerNumbers =
    options.targetConsumerNumbers && options.targetConsumerNumbers.length > 0
      ? options.targetConsumerNumbers.map((n) => n.trim())
      : (savedConfig.trackedConsumers || [])
          .filter((c: TnebTrackedConsumer) => c.enabled !== false)
          .map((c: TnebTrackedConsumer) => c.consumerNumber);

  const shouldSyncAll = options.syncAllFound !== undefined ? options.syncAllFound : savedConfig.syncAllFound;

  log(
    "info",
    `Starting TNEB Web Scraper for user "${username}" (Mode: ${shouldSyncAll ? "All Profile Accounts" : "Configured Targets: " + targetConsumerNumbers.join(", ")})`,
  );

  let browser: Browser | null = null;

  try {
    browser = await puppeteer.launch({
      headless: options.headless !== false,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--window-size=1280,800",
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    );

    // 1. Login with Captcha Solving (with up to 4 attempts)
    let loggedIn = false;
    const maxLoginAttempts = 4;

    for (let attempt = 1; attempt <= maxLoginAttempts; attempt++) {
      log("info", `[Login Attempt ${attempt}/${maxLoginAttempts}] Navigating to https://www.tnebnet.org/awp/login...`);

      await page.goto("https://www.tnebnet.org/awp/login", {
        waitUntil: "networkidle2",
        timeout: 45000,
      });

      await page.waitForSelector("#userName", { timeout: 15000 });
      await page.waitForSelector("#password", { timeout: 15000 });
      await page.waitForSelector("#CaptchaImgID", { timeout: 15000 });

      // Clear & fill credentials
      await page.evaluate(() => {
        const u = document.querySelector("#userName") as HTMLInputElement;
        const p = document.querySelector("#password") as HTMLInputElement;
        const c = document.querySelector("#CaptchaID") as HTMLInputElement;
        if (u) u.value = "";
        if (p) p.value = "";
        if (c) c.value = "";
      });

      await page.type("#userName", username, { delay: 30 });
      await page.type("#password", password, { delay: 30 });

      // Take screenshot of captcha element
      const captchaElement = await page.$("#CaptchaImgID");
      if (!captchaElement) {
        log("warn", "Captcha image element #CaptchaImgID not found on page");
        continue;
      }

      log("info", "Extracting Captcha node screenshot for OCR resolution...");
      const captchaBuffer = (await captchaElement.screenshot({
        encoding: "binary",
      })) as Buffer;

      let solvedCaptcha = "";
      try {
        solvedCaptcha = await solveNumericCaptcha(captchaBuffer);
        log("info", `Captcha solved by OCR: "${solvedCaptcha}"`);
      } catch (ocrErr: any) {
        log("warn", `Captcha OCR failed: ${ocrErr.message}`);
        continue;
      }

      if (!solvedCaptcha || solvedCaptcha.length < 4) {
        log("warn", `Solved captcha "${solvedCaptcha}" appears invalid (expected 5 digits). Retrying...`);
        continue;
      }

      await page.type("#CaptchaID", solvedCaptcha, { delay: 40 });

      // Submit form
      log("info", "Submitting login form...");
      await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => null),
        page.click('input[name="submit"], input[value="உட்புகல்"], input[type="submit"]'),
      ]);

      const currentUrl = page.url();
      log("info", `Redirected URL after submission: ${currentUrl}`);

      const pageContent = await page.content();
      if (
        currentUrl.includes("grouppay") ||
        currentUrl.includes("billStatus") ||
        pageContent.includes("Account Summary") ||
        pageContent.includes("Consumer No") ||
        pageContent.includes("summary.jpg")
      ) {
        log("success", "Successfully authenticated with TNEB Portal!");
        loggedIn = true;
        break;
      } else {
        const errorMsg = await page.evaluate(() => {
          const errBox = document.querySelector(".ui-messages-error-summary, .error, #msg, font[color='red']");
          return errBox ? errBox.textContent?.trim() : "Login or Captcha mismatch";
        });
        log("warn", `Authentication failed on attempt ${attempt}: ${errorMsg}`);
      }
    }

    if (!loggedIn) {
      throw new Error("Failed to log in to TNEB Portal after maximum captcha attempts.");
    }

    // 2. Navigate to Account Summary / Bill Status
    log("info", "Navigating to Account Summary (Bill Status)...");
    await page.goto("https://www.tnebnet.org/awp/billStatus", {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    await page.waitForSelector("table, tbody[id*='data']", { timeout: 15000 });

    // 3. Extract all Consumer Accounts from paginated table
    interface DiscoveredConsumer {
      consumerNo: string;
      consumerName: string;
      consumerAddress: string;
      formId: string;
      tokenId: string;
    }

    const discoveredConsumers: DiscoveredConsumer[] = [];
    const maxPages = options.maxPages || 5;

    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      log("info", `Scanning consumer account table on page ${pageNum}...`);

      const pageConsumers = await page.evaluate(() => {
        const list: DiscoveredConsumer[] = [];
        const rows = Array.from(document.querySelectorAll("tbody[id*='data'] tr, table tbody tr"));

        for (const row of rows) {
          const tds = Array.from(row.querySelectorAll("td"));
          if (tds.length >= 4) {
            const consumerNo = tds[0].textContent?.trim().replace(/[^0-9]/g, "") || "";
            const consumerName = tds[1].textContent?.trim() || "";
            const consumerAddress = tds[2].textContent?.trim() || "";

            const form = tds[3].querySelector("form") as HTMLFormElement | null;
            const tokenInput = tds[3].querySelector("input[name='tokenID']") as HTMLInputElement | null;

            if (consumerNo && (tokenInput || form)) {
              list.push({
                consumerNo,
                consumerName,
                consumerAddress,
                formId: form?.id || "",
                tokenId: tokenInput?.value || "",
              });
            }
          }
        }
        return list;
      });

      for (const c of pageConsumers) {
        if (!discoveredConsumers.some((existing) => existing.consumerNo === c.consumerNo)) {
          discoveredConsumers.push(c);
        }
      }

      // Check if next page link exists and is clickable
      const hasNext = await page.evaluate(() => {
        const nextBtn = document.querySelector(".ui-paginator-next:not(.ui-state-disabled)") as HTMLElement | null;
        if (nextBtn) {
          nextBtn.click();
          return true;
        }
        return false;
      });

      if (!hasNext) break;
      await new Promise((r) => setTimeout(r, 2000));
    }

    log("info", `Discovered ${discoveredConsumers.length} consumer account(s) registered in profile: ${discoveredConsumers.map((c) => c.consumerNo).join(", ")}`);

    // 4. Determine which accounts to scrape
    const consumersToScrape = shouldSyncAll
      ? discoveredConsumers
      : discoveredConsumers.filter((c) =>
          targetConsumerNumbers.length === 0 || targetConsumerNumbers.includes(c.consumerNo),
        );

    log("info", `Targeting ${consumersToScrape.length} consumer account(s) for detailed consumption & billing extraction...`);

    // 5. Scrape details for each consumer
    for (let i = 0; i < consumersToScrape.length; i++) {
      const consumer = consumersToScrape[i];
      log("info", `[${i + 1}/${consumersToScrape.length}] Fetching Service Details for Consumer #${consumer.consumerNo} (${consumer.consumerName})...`);

      try {
        // Direct POST to detconws.php using cookies or submitting the token form in a new tab
        const detailsPage = await browser.newPage();
        await detailsPage.setUserAgent(
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        );

        // Submit form via evaluate in page context
        await detailsPage.goto("about:blank");
        await detailsPage.setContent(`
          <html>
            <body>
              <form id="tnebForm" action="https://tneb.tnebnet.org/newlt/detconws.php" method="POST">
                <input type="hidden" name="tokenID" value="${consumer.tokenId}" />
              </form>
              <script>document.getElementById('tnebForm').submit();</script>
            </body>
          </html>
        `);

        await detailsPage.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => null);

        const detailsHtml = await detailsPage.content();
        await detailsPage.close();

        // Parse with tnebParser
        const parsed = parseTnebServiceDetailsHtml(detailsHtml);

        if (!parsed.account.consumerNumber || parsed.account.consumerNumber === "UNKNOWN") {
          parsed.account.consumerNumber = consumer.consumerNo;
        }
        if (!parsed.account.consumerName || parsed.account.consumerName === "UNKNOWN") {
          parsed.account.consumerName = consumer.consumerName;
        }
        if (!parsed.account.address && consumer.consumerAddress) {
          parsed.account.address = consumer.consumerAddress;
        }

        log("success", `Parsed Consumer #${parsed.account.consumerNumber}: ${parsed.bills.length} billing cycles | Tariff: ${parsed.account.tariffCode} | Dues: ${parsed.account.duesToBePaid}`);

        // Save to Firestore
        const saved = await saveTnebAccountAndBills(parsed.account, parsed.bills);
        log("info", `Persisted account #${parsed.account.consumerNumber} and ${saved.billsSavedCount} bill records to Firestore`);

        accounts.push(parsed.account);
        totalBillsProcessed += parsed.bills.length;
      } catch (consumerErr: any) {
        const msg = `Failed to scrape consumer #${consumer.consumerNo}: ${consumerErr.message}`;
        log("error", msg);
        errors.push(msg);
      }
    }

    log("success", `TNEB Sync completed successfully! Processed ${accounts.length} accounts and ${totalBillsProcessed} historical bills.`);

    return {
      success: errors.length === 0 || accounts.length > 0,
      accountsProcessed: accounts.length,
      billsProcessed: totalBillsProcessed,
      accounts,
      errors,
      logs,
    };
  } catch (globalErr: any) {
    const msg = `TNEB Scraper Global Error: ${globalErr.message}`;
    log("error", msg);
    errors.push(msg);
    return {
      success: false,
      accountsProcessed: accounts.length,
      billsProcessed: totalBillsProcessed,
      accounts,
      errors,
      logs,
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => null);
    }
  }
}
