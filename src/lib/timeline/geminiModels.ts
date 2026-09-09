/**
 * Active, verified Google Gemini models with multimodal audio & structured JSON support.
 * Prioritizes ultra-low latency (<1s) models to avoid 503 demand spikes and 404 deprecation errors.
 */

export const ACTIVE_GEMINI_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-flash-lite-latest",
  "gemini-3.7-flash",
  "gemini-3.5-flash",
  "gemini-3.6-flash",
] as const;

export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";

/**
 * Returns a prioritized list of active Gemini models.
 * Automatically upgrades deprecated / retired models (1.5, 2.0, 2.5, flash-latest)
 * to avoid 404 Not Found and 503 High Demand cascades.
 */
export function resolveGeminiCandidateModels(userModel?: string): string[] {
  const norm = (userModel || "").toLowerCase().trim();

  const isRetiredOrUnavailable =
    !norm ||
    norm.includes("1.5") ||
    norm.includes("2.0") ||
    norm.includes("2.5") ||
    norm === "gemini-flash-latest";

  const primary = isRetiredOrUnavailable ? DEFAULT_GEMINI_MODEL : userModel!;

  return Array.from(
    new Set([
      primary,
      "gemini-3.5-flash-lite",
      "gemini-flash-lite-latest",
      "gemini-3.7-flash",
      "gemini-3.5-flash",
      "gemini-3.6-flash",
    ])
  ).filter(Boolean);
}
