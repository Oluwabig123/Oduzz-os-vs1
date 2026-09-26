// Text-to-Speech (TTS) Voice Engine for ODUZZ OS

export type TTSOptions = {
  lang?: string;
  rate?: number;
  pitch?: number;
  enabled?: boolean;
};

let currentUtterance: SpeechSynthesisUtterance | null = null;

export function speakText(text: string, options: TTSOptions = {}) {
  const { lang = "en-US", rate = 1.0, pitch = 1.0, enabled = true } = options;

  if (!enabled || !("speechSynthesis" in window)) {
    return;
  }

  try {
    // Cancel any active speech to avoid audio overlapping
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = rate;
    utterance.pitch = pitch;

    // Try selecting a natural sounding voice if available
    const voices = window.speechSynthesis.getVoices();
    const matchingVoice = voices.find(
      (v) => v.lang.includes(lang) || v.lang.startsWith(lang.substring(0, 2))
    );

    if (matchingVoice) {
      utterance.voice = matchingVoice;
    }

    currentUtterance = utterance;
    window.speechSynthesis.speak(utterance);
  } catch (error) {
    console.error("❌ Speech synthesis error:", error);
  }
}

export function stopSpeech() {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}
