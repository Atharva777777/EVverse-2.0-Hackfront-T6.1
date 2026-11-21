/**
 * Journey Intelligence API client. Reuses the authenticated driver request helper
 * (X-Driver-Token) so preferences follow the driver's session.
 */
import { driverRequest } from "./driverApi";
import type {
  JourneyAiStatus,
  JourneyExplainResponse,
  JourneyIntentResult,
  JourneyAnalysis,
  JourneyAnalyzeRequest,
  JourneyOptionKind,
  JourneyParseResult,
  JourneyPreferencesResponse,
  JourneySuggestion,
} from "@/types/api";

export function analyzeJourney(payload: JourneyAnalyzeRequest): Promise<JourneyAnalysis> {
  return driverRequest<JourneyAnalysis>("/api/v1/journey/analyze", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function parseJourneyText(text: string, knownDestinations: string[]): Promise<JourneyParseResult> {
  return driverRequest<JourneyParseResult>("/api/v1/journey/parse", {
    method: "POST",
    body: JSON.stringify({ text, known_destinations: knownDestinations }),
  });
}

export function fetchJourneyPreferences(): Promise<JourneyPreferencesResponse> {
  return driverRequest<JourneyPreferencesResponse>("/api/v1/journey/preferences");
}

export function updateJourneyPreference(
  key: string,
  value: boolean | number | null,
): Promise<JourneyPreferencesResponse> {
  return driverRequest<JourneyPreferencesResponse>("/api/v1/journey/preferences", {
    method: "PUT",
    body: JSON.stringify({ key, value }),
  });
}

export function resetJourneyPersonalization(): Promise<{ preferences_removed: number; journeys_removed: number }> {
  return driverRequest("/api/v1/journey/preferences", { method: "DELETE" });
}

export async function fetchJourneySuggestions(): Promise<JourneySuggestion[]> {
  const res = await driverRequest<{ suggestions: JourneySuggestion[] }>("/api/v1/journey/suggestions");
  return res.suggestions;
}

export function acceptJourneySuggestion(key: string): Promise<JourneyPreferencesResponse> {
  return driverRequest<JourneyPreferencesResponse>("/api/v1/journey/suggestions/accept", {
    method: "POST",
    body: JSON.stringify({ key }),
  });
}

export function recordJourneyStarted(event: {
  destination_name: string;
  distance_km: number;
  option_kind: JourneyOptionKind;
  reserve_pct: number;
  start_battery_pct: number;
  stops_count: number;
  station_id?: string;
  station_name?: string;
  station_power_kw?: number | null;
}): Promise<{ recorded: boolean }> {
  return driverRequest("/api/v1/journey/events", { method: "POST", body: JSON.stringify(event) });
}

// ── AI assistance (optional - the planner works without any of this) ─────────

export function fetchAiStatus(): Promise<JourneyAiStatus> {
  return driverRequest<JourneyAiStatus>("/api/v1/journey/ai/status");
}

export function interpretJourney(
  text: string,
  knownDestinations: string[],
  selectedCity: string,
): Promise<JourneyIntentResult> {
  return driverRequest<JourneyIntentResult>("/api/v1/journey/intent", {
    method: "POST",
    body: JSON.stringify({ text, known_destinations: knownDestinations, selected_city: selectedCity }),
  });
}

export function transcribeAudio(audio: Blob): Promise<{ text: string; language: string | null }> {
  return driverRequest("/api/v1/journey/transcribe", {
    method: "POST",
    headers: { "Content-Type": audio.type || "audio/webm" },
    body: audio,
  });
}

export function explainJourney(
  payload: JourneyAnalyzeRequest,
  optionKind: JourneyOptionKind,
  language: string,
): Promise<JourneyExplainResponse> {
  return driverRequest<JourneyExplainResponse>("/api/v1/journey/explain", {
    method: "POST",
    body: JSON.stringify({ ...payload, option_kind: optionKind, language }),
  });
}
