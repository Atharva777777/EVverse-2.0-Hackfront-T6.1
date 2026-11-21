"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import type { JourneyAiStatus, JourneyIntentResult } from "@/types/api";
import { interpretJourney, transcribeAudio, updateJourneyPreference } from "@/lib/journeyApi";

const MAX_RECORDING_MS = 15000; // speech-to-text accepts up to 30 s; short is all a journey needs

interface Props {
  destinations: string[];
  selectedCity: string;
  ai: JourneyAiStatus | null;
  /** The planner validates nothing itself: it only applies what the backend already validated. */
  onIntent: (r: JourneyIntentResult) => void;
  onPickDestination: (name: string) => void;
  onPreferenceSaved: () => void;
  currentVehicleName: string;
}

type Voice = "idle" | "listening" | "transcribing";

export function JourneyAskBar({
  destinations, selectedCity, ai, onIntent, onPickDestination, onPreferenceSaved, currentVehicleName,
}: Props) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<JourneyIntentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [voice, setVoice] = useState<Voice>("idle");
  const recorder = useRef<MediaRecorder | null>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canVoice =
    !!ai?.voice && typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";

  const interpret = useCallback(
    async (input: string) => {
      if (!input.trim()) return;
      setBusy(true);
      setError(null);
      setDismissed([]);
      try {
        const r = await interpretJourney(input, destinations, selectedCity);
        setResult(r);
        onIntent(r);
      } catch {
        setError("Couldn't read that right now. You can use the controls below.");
      } finally {
        setBusy(false);
      }
    },
    [destinations, selectedCity, onIntent],
  );

  const stopTracks = () => recorder.current?.stream.getTracks().forEach((t) => t.stop());

  useEffect(() => () => {
    if (stopTimer.current) clearTimeout(stopTimer.current);
    stopTracks();
  }, []);

  const toggleVoice = async () => {
    if (voice === "listening") {
      recorder.current?.stop();
      return;
    }
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((m) => MediaRecorder.isTypeSupported(m));
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      rec.onstop = async () => {
        if (stopTimer.current) clearTimeout(stopTimer.current);
        stream.getTracks().forEach((t) => t.stop()); // release the microphone immediately
        setVoice("transcribing");
        try {
          const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
          const t = await transcribeAudio(blob);
          setText(t.text);
          setVoice("idle");
          await interpret(t.text);
        } catch {
          setVoice("idle");
          setError("Couldn't understand the recording. Try again, or type it instead.");
        }
      };
      recorder.current = rec;
      rec.start();
      setVoice("listening");
      stopTimer.current = setTimeout(() => rec.state === "recording" && rec.stop(), MAX_RECORDING_MS);
    } catch {
      setVoice("idle");
      setError("Microphone access wasn't allowed. You can type instead.");
    }
  };

  const visibleProposals = (result?.preference_proposals ?? []).filter((p) => !dismissed.includes(p.key));
  const aiNote =
    result?.source === "sarvam"
      ? "Understood with Sarvam AI"
      : result && result.ai_fallback_reason && !["not_configured", "budget"].includes(result.ai_fallback_reason)
        ? "Understood with basic matching — the AI assistant is unavailable right now"
        : null;

  return (
    <div>
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && interpret(text)}
          placeholder={ai?.available ? 'Or just say it: "Pune to Mumbai, one fast stop, keep 20%"' : 'Or type it: "Pune with 45% battery, keep 20% reserve"'}
          aria-label="Describe your journey"
          maxLength={300}
          className="min-w-0 flex-1 rounded-xl border border-black/10 bg-white px-3.5 py-2.5 text-sm placeholder:text-[#9AA09B] focus:outline-none focus:border-[#111312]"
        />
        {canVoice && (
          <button
            type="button"
            onClick={toggleVoice}
            disabled={voice === "transcribing" || busy}
            aria-label={voice === "listening" ? "Stop recording" : "Speak your journey"}
            title="Optional. Your recording is sent to Sarvam for transcription and is not stored by EVVERSE."
            className={`shrink-0 w-11 rounded-xl border flex items-center justify-center cursor-pointer disabled:opacity-40 ${
              voice === "listening" ? "bg-[#B91C1C] text-white border-[#B91C1C]" : "bg-white border-black/10"
            }`}
          >
            {voice === "listening" ? <Square size={15} /> : <Mic size={16} />}
          </button>
        )}
      </div>

      {voice === "listening" && <p className="text-[11px] text-[#B91C1C] mt-1.5">Listening… tap to stop</p>}
      {voice === "transcribing" && <p className="text-[11px] text-[#767D78] mt-1.5">Listening back…</p>}
      {busy && <p className="text-[11px] text-[#767D78] mt-1.5">Understanding…</p>}
      {error && <p className="text-[11px] text-[#B45309] mt-1.5">{error}</p>}

      {result && !busy && (
        <div className="mt-2 space-y-2" aria-live="polite">
          {result.understood.length > 0 && (
            <p className="text-[11px] text-[#525854]">
              Understood: {result.understood.join(" · ")}
              {aiNote && <span className="block text-[#8C938E] mt-0.5">{aiNote}</span>}
            </p>
          )}

          {result.vehicle && result.vehicle.name !== currentVehicleName && (
            <p className="text-[11px] text-[#B45309]">
              You mentioned {result.vehicle.name}. Switch vehicles from the garage to plan with it — this plan still uses {currentVehicleName}.
            </p>
          )}
          {result.notes.map((n, i) => <p key={i} className="text-[11px] text-[#767D78]">{n}</p>)}

          {result.clarifications.map((c) => (
            <div key={c.field} className="rounded-xl bg-[#F4F3EE] p-3">
              <p className="text-xs">{c.question}</p>
              {c.field === "destination" && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {c.options.map((o) => (
                    <button key={o} type="button" onClick={() => { onPickDestination(o); setResult((r) => r && { ...r, clarifications: r.clarifications.filter((x) => x.field !== "destination") }); }}
                      className="px-3 py-1.5 rounded-full text-xs bg-white border border-black/10 cursor-pointer">{o}</button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {visibleProposals.map((p) => (
            <div key={p.key} className="rounded-xl bg-[#F4F3EE] p-3 text-xs">
              <p>Save “{p.label}{typeof p.value === "number" ? `: ${p.value}%` : ""}” as a preference for future journeys?</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-full bg-[#111312] text-white cursor-pointer"
                  onClick={async () => {
                    try {
                      await updateJourneyPreference(p.key, p.value);
                      setDismissed((d) => [...d, p.key]);
                      onPreferenceSaved();
                    } catch {
                      setError("Couldn't save that preference.");
                    }
                  }}
                >
                  Save
                </button>
                <button type="button" className="px-3 py-1.5 rounded-full border border-black/10 cursor-pointer" onClick={() => setDismissed((d) => [...d, p.key])}>
                  Not now
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
