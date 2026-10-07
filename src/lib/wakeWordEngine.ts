// Oduzz OS — Multi-Variant Hands-Free Wake-Up Word Engine

export const DEFAULT_WAKE_VARIANTS = [
  "oduzz",
  "odus",
  "odos",
  "or dose",
  "oh duzz",
  "all does",
  "o duzz",
  "audus",
  "audos",
  "o dose",
  "old us",
  "hey oduzz",
  "hey odus",
  "hey odos",
  "hey or dose",
  "ok oduzz",
  "ok odus",
  "ok odos",
  "ok or dose",
  "okay oduzz",
  "hello oduzz",
  "hello odus",
  "hello odos",
];

const STORAGE_KEY = "oduzz_wake_variants";
const STORAGE_CHIME_KEY = "oduzz_wake_chime_enabled";

/**
 * Retrieves configured wake word variants from localStorage or defaults.
 */
export function getStoredWakeVariants(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn("Failed to load wake word variants from localStorage:", err);
  }
  return [...DEFAULT_WAKE_VARIANTS];
}

/**
 * Saves customized wake word variants to localStorage.
 */
export function saveWakeVariants(variants: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(variants));
  } catch (err) {
    console.error("Failed to save wake variants:", err);
  }
}

/**
 * Resets wake word variants to the default list.
 */
export function resetWakeVariants(): string[] {
  saveWakeVariants(DEFAULT_WAKE_VARIANTS);
  return [...DEFAULT_WAKE_VARIANTS];
}

/**
 * Checks if wake chime is enabled.
 */
export function isChimeEnabled(): boolean {
  try {
    const val = localStorage.getItem(STORAGE_CHIME_KEY);
    return val !== "false"; // Default true
  } catch {
    return true;
  }
}

/**
 * Toggles chime enabled state.
 */
export function setChimeEnabled(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_CHIME_KEY, enabled ? "true" : "false");
  } catch (err) {
    console.error("Failed to save chime preference:", err);
  }
}

/**
 * Plays a synthesized harmonic dual-tone chime using Web Audio API.
 * 100% offline, lightweight, and zero external audio file latency.
 */
export function playWakeChime() {
  if (!isChimeEnabled()) return;

  try {
    const AudioContextClass =
      window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    // Tone 1: C5 (523.25 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(523.25, now);

    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.25, now + 0.04);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.16);

    // Tone 2: G5 (783.99 Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(783.99, now + 0.08);

    gain2.gain.setValueAtTime(0, now + 0.08);
    gain2.gain.linearRampToValueAtTime(0.3, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    osc2.start(now + 0.08);
    osc2.stop(now + 0.35);
  } catch (error) {
    console.warn("Audio chime synthesis error:", error);
  }
}

/**
 * Cleans speech text for robust phonetic comparison.
 */
export function normalizeSpeech(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type WakeDetectionResult = {
  detected: boolean;
  matchedVariant?: string;
  commandText: string;
};

/**
 * Detects if a spoken transcript contains any of the wake word variants.
 * Handles:
 * 1. "Hey Odos, turn on the lights" -> detected=true, matched="hey odos", command="turn on the lights"
 * 2. "Or dose switch off living room" -> detected=true, matched="or dose", command="switch off living room"
 * 3. "Odus" -> detected=true, matched="odus", command="" (Wake & wait mode)
 */
export function detectWakeWord(
  rawTranscript: string,
  customVariants?: string[]
): WakeDetectionResult {
  const normalized = normalizeSpeech(rawTranscript);
  if (!normalized) {
    return { detected: false, commandText: "" };
  }

  const variants = customVariants || getStoredWakeVariants();
  // Sort variants by length descending so longer multi-word phrases match first (e.g. "hey or dose" before "or dose")
  const sortedVariants = [...variants]
    .map((v) => normalizeSpeech(v))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  for (const variant of sortedVariants) {
    // Check if transcript starts with the wake variant or contains it at word boundary
    const regex = new RegExp(`(^|\\b)${escapeRegExp(variant)}(\\b|$)`, "i");
    const match = normalized.match(regex);

    if (match && typeof match.index === "number") {
      const matchStart = match.index;
      const matchLength = match[0].length;

      // Extract remaining text after the wake word
      const rawAfter = normalized.substring(matchStart + matchLength).trim();

      // Clean up common filler words between wake word and command: "can you", "please", "could you"
      let cleanCommand = rawAfter.replace(/^(can you|could you|please)\s+/i, "").trim();

      return {
        detected: true,
        matchedVariant: variant,
        commandText: cleanCommand,
      };
    }
  }

  return {
    detected: false,
    commandText: "",
  };
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
