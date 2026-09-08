import crypto from "crypto";

/**
 * CMWSSB uses AES-256-CBC with PBKDF2 (SHA-512, 999 iterations, 256 bits).
 * This function matches the Angular client implementation in chunk-CHNT7TQO.js.
 */
export function encryptForCMWSSB(text: string, secretKey: string): string {
  const iv = crypto.randomBytes(16);
  const salt = crypto.randomBytes(32); // 256-bit salt
  const iterations = 999;
  
  // PBKDF2 derive 256-bit key using SHA-512
  const key = crypto.pbkdf2Sync(secretKey, salt, iterations, 32, "sha512");
  
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(text, "utf8");
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  
  const payload = {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("hex"),
    salt: salt.toString("hex"),
    iterations: iterations,
  };
  
  // Return base64 of JSON string
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

/**
 * Decrypts CMWSSB encrypted payloads (e.g. from localStorage or API).
 */
export function decryptFromCMWSSB(base64Payload: string, secretKey: string): string {
  const raw = Buffer.from(base64Payload, "base64").toString("utf8");
  const obj = JSON.parse(raw);
  const salt = Buffer.from(obj.salt, "hex");
  const iv = Buffer.from(obj.iv, "hex");
  const iterations = obj.iterations || 999;
  
  const key = crypto.pbkdf2Sync(secretKey, salt, iterations, 32, "sha512");
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(Buffer.from(obj.ciphertext, "base64"));
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  
  return decrypted.toString("utf8");
}
