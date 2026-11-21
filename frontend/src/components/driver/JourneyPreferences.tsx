"use client";

import React, { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import type { JourneyPreference, JourneySuggestion } from "@/types/api";
import {
  acceptJourneySuggestion,
  fetchJourneyPreferences,
  fetchJourneySuggestions,
  resetJourneyPersonalization,
  updateJourneyPreference,
} from "@/lib/journeyApi";

const TOGGLES: { key: string; label: string; hint: string }[] = [
  { key: "prefer_reliable_charging", label: "Reliable chargers first", hint: "Favour chargers with a recently updated listing over the shortest detour." },
  { key: "prefer_faster_chargers", label: "Faster chargers", hint: "Favour higher-power chargers when choosing a stop." },
  { key: "prefer_fewer_stops", label: "Fewer charging stops", hint: "Lead with the option that needs the least charging." },
];

function sourceText(p: JourneyPreference): string {
  if (!p.is_set) return "Not set";
  if (p.source === "accepted_suggestion") return `Accepted from your history${p.evidence ? ` · ${p.evidence}` : ""}`;
  return "Set by you";
}

function Switch({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors cursor-pointer ${on ? "bg-[#111312]" : "bg-black/15"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

interface Props {
  onClose: () => void;
  /** Called whenever stored preferences change so the planner can recalculate. */
  onChanged: (prefs: JourneyPreference[]) => void;
}

export function JourneyPreferences({ onClose, onChanged }: Props) {
  const [prefs, setPrefs] = useState<JourneyPreference[]>([]);
  const [journeys, setJourneys] = useState(0);
  const [suggestions, setSuggestions] = useState<JourneySuggestion[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const apply = useCallback(
    (res: { preferences: JourneyPreference[]; journeys_recorded: number }) => {
      setPrefs(res.preferences);
      setJourneys(res.journeys_recorded);
      onChanged(res.preferences);
    },
    [onChanged],
  );

  const load = useCallback(async () => {
    try {
      const res = await fetchJourneyPreferences();
      setPrefs(res.preferences);
      setJourneys(res.journeys_recorded);
      setSuggestions(await fetchJourneySuggestions());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your preferences.");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const get = (key: string) => prefs.find((p) => p.key === key);

  const set = async (key: string, value: boolean | number | null) => {
    setError(null);
    try {
      apply(await updateJourneyPreference(key, value));
      setSuggestions(await fetchJourneySuggestions());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that change.");
    }
  };

  const accept = async (s: JourneySuggestion) => {
    try {
      apply(await acceptJourneySuggestion(s.key));
      setSuggestions(await fetchJourneySuggestions());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not apply that suggestion.");
    }
  };

  const reset = async () => {
    try {
      await resetJourneyPersonalization();
      setConfirmReset(false);
      await load();
      const res = await fetchJourneyPreferences();
      apply(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reset.");
    }
  };

  const learning = get("personalization_enabled")?.value === true;
  const reserve = get("default_reserve_pct");
  const visibleSuggestions = suggestions.filter((s) => !dismissed.includes(s.key));

  return (
    <div className="fixed inset-0 z-[3000] flex items-end sm:items-center justify-center bg-black/30" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Your journey preferences"
        className="w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[#FBFAF7] p-5 text-[#111312] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">Your preferences</h2>
            <p className="text-xs text-[#767D78] mt-0.5">Everything used to personalise your journeys is shown here. You can change or remove it at any time.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-full hover:bg-black/5 cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {error && <p className="mt-3 text-xs text-[#B91C1C]">{error}</p>}

        <div className="mt-5 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-medium">Learn from my journeys</div>
              <p className="text-xs text-[#767D78] mt-0.5">
                When on, journeys you start are remembered (destination name, distance, reserve and the charger you chose — never your location) so we can suggest preferences. Nothing is applied until you accept it.
              </p>
            </div>
            <Switch on={learning} label="Learn from my journeys" onClick={() => set("personalization_enabled", !learning)} />
          </div>

          {TOGGLES.map((t) => {
            const p = get(t.key);
            const on = p?.value === true;
            return (
              <div key={t.key} className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-medium">{t.label}</div>
                  <p className="text-xs text-[#767D78] mt-0.5">{t.hint}</p>
                  {p && <p className="text-[11px] text-[#8C938E] mt-0.5">{sourceText(p)}</p>}
                </div>
                <Switch on={on} label={t.label} onClick={() => set(t.key, on ? null : true)} />
              </div>
            );
          })}

          <div>
            <div className="text-sm font-medium">Usual arrival reserve</div>
            <p className="text-xs text-[#767D78] mt-0.5">The battery you like to have left when you arrive.</p>
            <div className="mt-2 flex items-center gap-2">
              {[10, 15, 20, 30].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => set("default_reserve_pct", reserve?.value === v ? null : v)}
                  className={`px-3 py-1.5 rounded-full text-xs border cursor-pointer ${reserve?.value === v ? "bg-[#111312] text-white border-[#111312]" : "bg-white border-black/10"}`}
                >
                  {v}%
                </button>
              ))}
            </div>
            {reserve && <p className="text-[11px] text-[#8C938E] mt-1">{sourceText(reserve)}</p>}
          </div>
        </div>

        {visibleSuggestions.length > 0 && (
          <div className="mt-6 rounded-2xl bg-white border border-black/[0.08] p-4 space-y-3">
            <div className="text-sm font-medium">Suggested from your history</div>
            {visibleSuggestions.map((s) => (
              <div key={s.key} className="text-sm">
                <p>{s.text}</p>
                <p className="text-[11px] text-[#8C938E] mt-0.5">{s.evidence}</p>
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => accept(s)} className="px-3 py-1.5 rounded-full text-xs bg-[#111312] text-white cursor-pointer">Use this</button>
                  <button type="button" onClick={() => setDismissed((d) => [...d, s.key])} className="px-3 py-1.5 rounded-full text-xs border border-black/10 cursor-pointer">Not now</button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 border-t border-black/[0.06] pt-4 flex items-center justify-between gap-3">
          <p className="text-xs text-[#767D78]">{journeys} journey{journeys === 1 ? "" : "s"} remembered</p>
          {confirmReset ? (
            <div className="flex gap-2">
              <button type="button" onClick={reset} className="px-3 py-1.5 rounded-full text-xs bg-[#B91C1C] text-white cursor-pointer">Yes, forget everything</button>
              <button type="button" onClick={() => setConfirmReset(false)} className="px-3 py-1.5 rounded-full text-xs border border-black/10 cursor-pointer">Cancel</button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmReset(true)} className="px-3 py-1.5 rounded-full text-xs border border-black/10 cursor-pointer">
              Reset personalisation
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
