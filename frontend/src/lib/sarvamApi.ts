/**
 * frontend/src/lib/sarvamApi.ts
 * ==============================
 * Client helper for SARVAM conversational EV intelligence API.
 */

export interface SarvamMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  language?: string;
  toolsUsed?: string[];
  dataCard?: any;
  timestamp: string;
  audioBase64?: string;
}

export interface SarvamStatus {
  status: string;
  bot_name: string;
  subtitle: string;
  ai_available: boolean;
  neo4j_connected: boolean;
  voice_input: boolean;
  voice_output: boolean;
  supported_languages: Array<{ code: string; name: string }>;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export async function fetchSarvamStatus(): Promise<SarvamStatus> {
  const res = await fetch(`${API_BASE}/api/v1/sarvam/status`);
  if (!res.ok) {
    throw new Error(`Failed to fetch Sarvam status: ${res.statusText}`);
  }
  return res.json();
}

export async function sendSarvamChat(
  message: string,
  history: Array<{ role: string; content: string }>,
  language?: string,
  driverId: string = "demo_driver_pune"
): Promise<{
  reply: string;
  language: string;
  tools_used: string[];
  data_card?: any;
  timestamp: string;
}> {
  const res = await fetch(`${API_BASE}/api/v1/sarvam/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      history,
      language,
      driver_id: driverId,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Sarvam chat request failed.");
  }
  return res.json();
}

export async function sendSarvamVoice(
  audioBlob: Blob,
  languageCode?: string
): Promise<{
  transcription: string;
  reply: string;
  language: string;
  tools_used: string[];
  data_card?: any;
  audio_base64?: string;
  timestamp: string;
}> {
  const url = new URL(`${API_BASE}/api/v1/sarvam/voice-chat`);
  if (languageCode) {
    url.searchParams.set("language_code", languageCode);
  }

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": audioBlob.type || "audio/webm",
    },
    body: audioBlob,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail?.message || err.detail || "Voice processing failed.");
  }
  return res.json();
}

export async function fetchSarvamTTS(
  text: string,
  language: string = "en-IN",
  speaker: string = "kavya"
): Promise<{ audio_base64: string; format: string }> {
  const res = await fetch(`${API_BASE}/api/v1/sarvam/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      language,
      speaker,
    }),
  });

  if (!res.ok) {
    throw new Error("TTS conversion failed.");
  }
  return res.json();
}
