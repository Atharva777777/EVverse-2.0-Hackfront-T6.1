"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  MessageSquare,
  X,
  Minus,
  Send,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Sparkles,
  Zap,
  Battery,
  ShieldCheck,
  MapPin,
  Car,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
} from "lucide-react";
import {
  SarvamMessage,
  SarvamStatus,
  fetchSarvamStatus,
  sendSarvamChat,
  sendSarvamVoice,
  fetchSarvamTTS,
} from "@/lib/sarvamApi";

const QUICK_PROMPTS = [
  {
    label: "Pune to Mumbai with 35% battery?",
    text: "I have a Tata Nexon EV with 35% battery. Can I travel from Pune to Mumbai?",
    icon: Zap,
  },
  {
    label: "My vehicle specs & connectors",
    text: "What vehicle do I have and what are its battery and connector specifications?",
    icon: Car,
  },
  {
    label: "Find fast chargers in Pune",
    text: "Find verified fast charging stations in Pune",
    icon: MapPin,
  },
  {
    label: "पुणे ते मुंबई चार्जिंग लागेल का? (मराठी)",
    text: "माझ्या नेक्सॉन गाडीने ३५% बॅटरीवर पुणे ते मुंबई प्रवास करू शकतो का?",
    icon: Sparkles,
  },
  {
    label: "क्या 35% बैटरी में मुंबई पहुंच सकते हैं? (हिंदी)",
    text: "क्या मैं 35% बैटरी के साथ पुणे से मुंबई जा सकता हूँ?",
    icon: Sparkles,
  },
];

export function SarvamAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<SarvamStatus | null>(null);
  const [selectedLang, setSelectedLang] = useState<string>("en-IN");
  const [messages, setMessages] = useState<SarvamMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  // Load status on mount
  useEffect(() => {
    fetchSarvamStatus()
      .then(setStatus)
      .catch((e) => console.warn("Sarvam status check failed:", e));
  }, []);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  // Stop audio on unmount
  useEffect(() => {
    return () => {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
    };
  }, []);

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || isLoading) return;

    const userMsg: SarvamMessage = {
      id: `usr_${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInput("");
    setIsLoading(true);

    try {
      const history = messages.slice(-4).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await sendSarvamChat(text, history, selectedLang);

      const botMsg: SarvamMessage = {
        id: `bot_${Date.now()}`,
        role: "assistant",
        content: res.reply,
        language: res.language,
        toolsUsed: res.tools_used,
        dataCard: res.data_card,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err: any) {
      const errorMsg: SarvamMessage = {
        id: `bot_err_${Date.now()}`,
        role: "assistant",
        content:
          "I encountered an issue connecting with the EVverse engine. Please verify the backend is running and try again.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartVoice = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setIsRecording(false);
        setIsLoading(true);

        try {
          const res = await sendSarvamVoice(audioBlob, selectedLang);

          // Add user's transcribed message
          const userMsg: SarvamMessage = {
            id: `usr_v_${Date.now()}`,
            role: "user",
            content: res.transcription || "[Voice Message]",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          };

          // Add bot response
          const botMsg: SarvamMessage = {
            id: `bot_v_${Date.now()}`,
            role: "assistant",
            content: res.reply,
            language: res.language,
            toolsUsed: res.tools_used,
            dataCard: res.data_card,
            audioBase64: res.audio_base64,
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          };

          setMessages((prev) => [...prev, userMsg, botMsg]);

          // Auto-play response audio if available
          if (res.audio_base64) {
            playAudio(botMsg.id, res.audio_base64);
          }
        } catch (e: any) {
          const errorMsg: SarvamMessage = {
            id: `bot_err_${Date.now()}`,
            role: "assistant",
            content: "We couldn't hear or transcribe that recording clearly. Please try again or type your question.",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          };
          setMessages((prev) => [...prev, errorMsg]);
        } finally {
          setIsLoading(false);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
    } catch (e) {
      console.warn("Microphone access denied or unsupported:", e);
      alert("Microphone access is needed for voice input in SARVAM.");
    }
  };

  const handleStopVoice = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
    }
  };

  const playAudio = async (msgId: string, b64Audio?: string, text?: string, lang?: string) => {
    if (playingAudioId === msgId && currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
      setPlayingAudioId(null);
      return;
    }

    try {
      let audioData = b64Audio;
      if (!audioData && text) {
        const ttsRes = await fetchSarvamTTS(text.slice(0, 250), lang || selectedLang);
        audioData = ttsRes.audio_base64;
      }

      if (audioData) {
        if (currentAudioRef.current) {
          currentAudioRef.current.pause();
        }
        const audio = new Audio(`data:audio/wav;base64,${audioData}`);
        currentAudioRef.current = audio;
        setPlayingAudioId(msgId);

        audio.onended = () => {
          setPlayingAudioId(null);
          currentAudioRef.current = null;
        };

        audio.play();
      }
    } catch (e) {
      console.warn("Audio playback failed:", e);
      setPlayingAudioId(null);
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 font-sans">
      {/* ── Launcher Pill / Button ────────────────────────────────────────── */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="group relative flex items-center gap-3 bg-[#111413] hover:bg-[#161B18] text-[#E8ECE9] border border-[#2B332E] hover:border-[#10b981] shadow-2xl px-4 py-3 rounded-full transition-all duration-300 hover:scale-105 active:scale-95"
          aria-label="Open SARVAM Assistant"
        >
          {/* Glowing pulse indicator */}
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </span>

          <div className="flex flex-col text-left">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold tracking-wider text-emerald-400 font-mono">SARVAM</span>
              <span className="text-[10px] bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 px-1 rounded font-mono">
                AI
              </span>
            </div>
            <span className="text-[11px] text-[#8C9590] hidden sm:inline">EV Intelligence Assistant</span>
          </div>

          <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 ml-1">
            <Sparkles className="w-4 h-4" />
          </div>
        </button>
      )}

      {/* ── Compact Expandable Chat Panel ─────────────────────────────────── */}
      {isOpen && (
        <div className="relative flex flex-col w-[380px] max-w-[calc(100vw-2.5rem)] h-[560px] max-h-[calc(100vh-6rem)] bg-[#111413]/95 backdrop-blur-xl border border-[#2B332E] rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-[#161B18] border-b border-[#242C27]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-[#E8ECE9] font-mono tracking-tight">SARVAM</h3>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="Connected to Sarvam & Neo4j" />
                </div>
                <p className="text-[10px] text-[#8C9590] tracking-wide">Your EV Intelligence Assistant</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Language Pills */}
              <div className="flex items-center bg-[#0E1210] rounded-md p-0.5 border border-[#242C27] text-[10px] font-mono mr-1">
                {(["en-IN", "hi-IN", "mr-IN"] as const).map((code) => (
                  <button
                    key={code}
                    onClick={() => setSelectedLang(code)}
                    className={`px-1.5 py-0.5 rounded transition-colors ${
                      selectedLang === code
                        ? "bg-emerald-600 text-white font-bold"
                        : "text-[#8C9590] hover:text-[#E8ECE9]"
                    }`}
                    title={code === "en-IN" ? "English" : code === "hi-IN" ? "Hindi (हिंदी)" : "Marathi (मराठी)"}
                  >
                    {code === "en-IN" ? "EN" : code === "hi-IN" ? "HI" : "MR"}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-md text-[#8C9590] hover:text-[#E8ECE9] hover:bg-[#202722] transition-colors"
                title="Minimize SARVAM"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Subheader Banner (Status Indicators) */}
          <div className="px-4 py-1.5 bg-[#0D100F] border-b border-[#1E2420] flex items-center justify-between text-[10px] font-mono text-[#8C9590]">
            <span className="flex items-center gap-1.5 text-emerald-400/90">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              Sarvam AI + Neo4j Aura Verified
            </span>
            <span className="text-[#656E68]">Zero Hallucination Physics</span>
          </div>

          {/* Messages Scroll Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs">
            {/* Empty State / Welcome */}
            {messages.length === 0 && (
              <div className="space-y-4 py-2">
                <div className="p-3.5 rounded-xl bg-[#161B18]/70 border border-[#242C27] text-[#A6AFA9] leading-relaxed">
                  <p className="font-semibold text-emerald-400 mb-1 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" /> Hello Driver!
                  </p>
                  I am <strong className="text-white">SARVAM</strong>. I combine <strong>Sarvam AI</strong> and{" "}
                  <strong>Neo4j Graph Intelligence</strong> with EVverse&apos;s deterministic physics to provide verified
                  battery calculations, corridor reachability, and charging stop recommendations.
                </div>

                <div className="space-y-1.5">
                  <p className="text-[10px] font-mono text-[#656E68] uppercase tracking-wider px-1">Quick Starters</p>
                  <div className="grid grid-cols-1 gap-1.5">
                    {QUICK_PROMPTS.map((qp, idx) => {
                      const Icon = qp.icon;
                      return (
                        <button
                          key={idx}
                          onClick={() => handleSend(qp.text)}
                          className="flex items-center gap-2 p-2 rounded-lg bg-[#141816] hover:bg-[#1C231F] border border-[#242C27] text-left text-[#C2C9C4] hover:text-[#E8ECE9] transition-all hover:border-emerald-600/40 text-[11px]"
                        >
                          <Icon className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                          <span className="truncate">{qp.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Conversation Messages */}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"} space-y-1`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 leading-relaxed text-[12px] ${
                    m.role === "user"
                      ? "bg-emerald-700/80 text-white rounded-br-none border border-emerald-500/30"
                      : "bg-[#181D1A] text-[#DCE2DE] rounded-bl-none border border-[#2A332C]"
                  }`}
                >
                  {/* Tool Badge */}
                  {m.role === "assistant" && m.toolsUsed && m.toolsUsed.length > 0 && (
                    <div className="flex items-center gap-1 mb-1.5 text-[9px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-1.5 py-0.5 rounded w-fit">
                      <ShieldCheck className="w-2.5 h-2.5" />
                      {m.toolsUsed.includes("journey_feasibility")
                        ? "Deterministic Physics Engine"
                        : m.toolsUsed.includes("vehicle_details")
                        ? "Neo4j Vehicle & Connectors"
                        : m.toolsUsed.includes("station_discovery")
                        ? "Neo4j Verified Stations"
                        : "Verified EVverse Intelligence"}
                    </div>
                  )}

                  {/* Message Prose */}
                  <div className="whitespace-pre-line">{m.content}</div>

                  {/* Interactive Data Card Widget */}
                  {m.dataCard && (
                    <div className="mt-2.5 pt-2 border-t border-[#2A332C] space-y-2">
                      {/* 1. Journey Feasibility Card */}
                      {m.dataCard.type === "journey_card" && (
                        <div className="p-2.5 rounded-lg bg-[#0E1210] border border-[#2A332C] space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono text-[#8C9590]">FEASIBILITY VERDICT</span>
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded font-mono ${
                                m.dataCard.data?.verdict === "SAFE_TO_DRIVE"
                                  ? "bg-emerald-950 text-emerald-400 border border-emerald-700"
                                  : "bg-red-950 text-red-400 border border-red-800"
                              }`}
                            >
                              {m.dataCard.data?.verdict}
                            </span>
                          </div>
                          <div className="text-[11px] font-medium text-white">
                            {m.dataCard.data?.origin} → {m.dataCard.data?.destination} ({m.dataCard.data?.distance_km} km)
                          </div>
                          <div className="grid grid-cols-2 gap-1 text-[10px] font-mono text-[#A6AFA9]">
                            <div>Start SOC: <span className="text-white font-bold">{m.dataCard.data?.start_battery_pct}%</span></div>
                            <div>Arrival SOC: <span className="text-white font-bold">{m.dataCard.data?.arrival_battery_pct != null ? `${m.dataCard.data.arrival_battery_pct}%` : "Depleted"}</span></div>
                          </div>
                        </div>
                      )}

                      {/* 2. Vehicle Details Card */}
                      {m.dataCard.type === "vehicle_card" && (
                        <div className="p-2.5 rounded-lg bg-[#0E1210] border border-[#2A332C] space-y-1">
                          <div className="text-[11px] font-bold text-white flex items-center gap-1.5">
                            <Car className="w-3.5 h-3.5 text-emerald-400" />
                            {m.dataCard.data?.make} {m.dataCard.data?.model}
                          </div>
                          <div className="grid grid-cols-2 gap-1 text-[10px] font-mono text-[#A6AFA9] pt-1">
                            <div>Battery: <span className="text-white">{m.dataCard.data?.usable_kwh} kWh</span></div>
                            <div>Current SOC: <span className="text-emerald-400 font-bold">{m.dataCard.data?.current_battery_pct}%</span></div>
                            <div>Range: <span className="text-white">{m.dataCard.data?.wltp_range_km} km</span></div>
                            <div>Plugs: <span className="text-white">{m.dataCard.data?.supported_connectors?.join(", ")}</span></div>
                          </div>
                        </div>
                      )}

                      {/* 3. Charging Stations Card */}
                      {m.dataCard.type === "station_card" && (
                        <div className="p-2 rounded-lg bg-[#0E1210] border border-[#2A332C] space-y-1.5">
                          <div className="text-[10px] font-mono text-[#8C9590]">VERIFIED STATIONS ({m.dataCard.data?.corridor})</div>
                          <div className="space-y-1">
                            {m.dataCard.data?.stations?.slice(0, 3).map((st: any, sIdx: number) => (
                              <div key={sIdx} className="p-1.5 rounded bg-[#161B18] text-[10px] flex items-center justify-between">
                                <div>
                                  <div className="font-semibold text-white">{st.name}</div>
                                  <div className="text-[#8C9590]">{st.operator || "Station"} • {st.connectors?.join(", ")}</div>
                                </div>
                                {st.power_kw && (
                                  <span className="text-emerald-400 font-mono font-bold">{st.power_kw} kW</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Message Actions (TTS Voice Playback) */}
                  {m.role === "assistant" && (
                    <div className="flex items-center justify-between mt-2 pt-1 text-[9px] text-[#656E68]">
                      <span>{m.timestamp}</span>
                      <button
                        onClick={() => playAudio(m.id, m.audioBase64, m.content, m.language)}
                        className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors ${
                          playingAudioId === m.id
                            ? "bg-emerald-600 text-white font-bold"
                            : "hover:bg-[#2A332C] text-[#8C9590] hover:text-white"
                        }`}
                        title="Listen with Sarvam Voice"
                      >
                        {playingAudioId === m.id ? (
                          <>
                            <VolumeX className="w-3 h-3" /> Stop
                          </>
                        ) : (
                          <>
                            <Volume2 className="w-3 h-3 text-emerald-400" /> Speak
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {m.role === "user" && <span className="text-[9px] text-[#656E68] pr-1">{m.timestamp}</span>}
              </div>
            ))}

            {/* Loading Indicator */}
            {isLoading && (
              <div className="flex items-center gap-2 p-3 rounded-2xl bg-[#181D1A] text-[#8C9590] border border-[#2A332C] w-fit">
                <div className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-[11px] font-mono">Sarvam AI is calculating...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Footer Input Area */}
          <div className="p-3 bg-[#161B18] border-t border-[#242C27] space-y-2">
            {/* Active Recording State */}
            {isRecording && (
              <div className="flex items-center justify-between p-2 rounded-lg bg-red-950/60 border border-red-800 text-red-200 text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
                  <span className="font-mono text-[11px]">Recording audio (Sarvam Saaras)...</span>
                </div>
                <button
                  onClick={handleStopVoice}
                  className="px-2 py-0.5 rounded bg-red-600 hover:bg-red-500 text-white font-bold text-[10px]"
                >
                  Done
                </button>
              </div>
            )}

            <div className="flex items-center gap-2">
              {/* Voice Input Button */}
              <button
                type="button"
                onClick={isRecording ? handleStopVoice : handleStartVoice}
                className={`p-2 rounded-xl transition-all ${
                  isRecording
                    ? "bg-red-600 text-white animate-pulse"
                    : "bg-[#202722] hover:bg-[#28322B] text-[#A6AFA9] hover:text-emerald-400 border border-[#2B332E]"
                }`}
                title={isRecording ? "Stop recording" : "Voice input (Sarvam Saaras STT)"}
              >
                {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              {/* Text Input */}
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={
                  selectedLang === "mr-IN"
                    ? "नेक्सॉन गाडी किंवा प्रवासाविषयी विचारा..."
                    : selectedLang === "hi-IN"
                    ? "ईवी ट्रिप या चार्जिंग के बारे में पूछें..."
                    : "Ask about your EV, journey range, or chargers..."
                }
                className="flex-1 bg-[#0E1210] border border-[#2B332E] focus:border-emerald-500/80 rounded-xl px-3 py-2 text-xs text-[#E8ECE9] placeholder-[#5A635E] outline-none transition-colors"
                disabled={isLoading}
              />

              {/* Send Button */}
              <button
                type="button"
                onClick={() => handleSend()}
                disabled={!input.trim() || isLoading}
                className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white transition-all shadow-md"
                title="Send message"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
