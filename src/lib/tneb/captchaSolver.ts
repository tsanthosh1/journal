import path from "path";
import { createWorker } from "tesseract.js";

/**
 * Solves a 5-digit numeric image captcha from buffer or base64 using Tesseract.js
 */
export async function solveNumericCaptcha(imageBuffer: Buffer | string): Promise<string> {
  const workerScriptPath = path.resolve(
    process.cwd(),
    "node_modules/tesseract.js/src/worker-script/node/index.js",
  );

  const worker = await createWorker("eng", 1, {
    workerPath: workerScriptPath,
    errorHandler: (err) => console.warn("Tesseract worker notice:", err),
  });

  try {
    await worker.setParameters({
      tessedit_char_whitelist: "0123456789",
      tessedit_pageseg_mode: "7" as any, // Single text line
    });

    const ret = await worker.recognize(imageBuffer as any);
    const text = ret.data.text.replace(/[^0-9]/g, "").trim();

    await worker.terminate();
    return text;
  } catch (err) {
    await worker.terminate().catch(() => {});
    throw err;
  }
}
