"use client";

/**
 * AI Assistant
 * ────────────
 * Three actually-working tabs:
 *
 * 1. Transcribe — capture audio with MediaRecorder, render a live waveform
 *    via WebAudio AnalyserNode, POST the blob to /api/ai/transcribe, show
 *    the structured note + recent transcriptions for the patient.
 *
 * 2. Summarize — pull a patient's consultation notes and run any one of
 *    them through /api/ai/summarize, or summarize free-text pasted in.
 *
 * 3. Ask — pick a patient, ask a question; server assembles context
 *    (recent visits, allergies, meds, vitals) and answers via GPT.
 *
 * Every tab has a non-AI fallback so the page is still useful when
 * OPENAI_API_KEY isn't configured (prod currently doesn't have one).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Mic,
  MicOff,
  Search,
  Sparkles,
  Square,
  Brain,
  FileText,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Send,
  RefreshCw,
  Clock,
  User as UserIcon,
} from "lucide-react";
import { Button, Card, CardContent, Input, Select, Textarea, Badge } from "@/components/ui";
import { LoadingSpinner } from "@/components/ui/loading";
import { usePatients } from "@/hooks/use-queries";
import type { Patient } from "@/types";
import { useModuleAccess } from "@/modules/core/hooks";

type TabId = "transcribe" | "summarize" | "ask";

export default function AIAssistantPage() {
  const access = useModuleAccess("MOD-AI-TRANSCRIPTION");
  const [tab, setTab] = useState<TabId>("transcribe");

  if (!access.canView) {
    return (
      <div className="flex items-center justify-center py-20 text-stone-500 text-sm">
        You don&apos;t have access to this module.
      </div>
    );
  }

  const tabs: { id: TabId; label: string; icon: typeof Mic; hint: string }[] = [
    { id: "transcribe", label: "Transcribe", icon: Mic, hint: "Record consult → structured note" },
    { id: "summarize", label: "Summarize", icon: Sparkles, hint: "Compress a long note to key points" },
    { id: "ask", label: "Ask", icon: Brain, hint: "Q&A grounded on a patient's chart" },
  ];

  return (
    <div data-id="AI-ASSISTANT" className="animate-fade-in space-y-5 sm:space-y-6">
      {/* Header — gradient hero, sets the modernity tone */}
      <div className="relative overflow-hidden rounded-2xl border border-stone-100 bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 px-5 py-5 sm:px-7 sm:py-6 text-white">
        <div className="absolute inset-0 opacity-25 [background:radial-gradient(circle_at_30%_30%,#fff_0,transparent_45%)]" />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Sparkles className="w-4 h-4" />
              <span className="text-[11px] uppercase tracking-wider font-semibold opacity-90">AI Assistant</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold leading-tight">Faster notes, sharper recall.</h1>
            <p className="text-sm opacity-90 mt-1 max-w-xl">
              Transcribe a consult, summarize long notes, or ask a question grounded on a patient&apos;s chart.
            </p>
          </div>
          <AIStatusPill />
        </div>
      </div>

      {/* Tab strip with hints under each */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`text-left rounded-2xl border p-3 sm:p-4 transition-all cursor-pointer ${
                active
                  ? "border-indigo-200 bg-white shadow-sm ring-1 ring-indigo-100"
                  : "border-stone-100 bg-stone-50 hover:bg-white hover:border-stone-200"
              }`}
            >
              <div className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                    active ? "bg-indigo-50 text-indigo-600" : "bg-white text-stone-500 border border-stone-100"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <span className={`text-sm font-semibold ${active ? "text-stone-900" : "text-stone-700"}`}>{t.label}</span>
              </div>
              <p className="text-[11px] text-stone-500 mt-1.5 leading-snug">{t.hint}</p>
            </button>
          );
        })}
      </div>

      <div className="animate-fade-in">
        {tab === "transcribe" && <TranscribeTab />}
        {tab === "summarize" && <SummarizeTab />}
        {tab === "ask" && <AskTab />}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// AI status pill — quick visual cue whether the LLM is wired up. Calls a
// no-op endpoint with `text: "ping"` so we know if a real key is on.
// ═════════════════════════════════════════════════════════════════════

function AIStatusPill() {
  // Cheap probe — summarize "ping". If aiPowered is true the key is set.
  const { data } = useQuery({
    queryKey: ["ai", "status"],
    staleTime: 60_000,
    queryFn: async () => {
      const r = await fetch("/api/ai/summarize", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "ping" }),
      });
      const d = await r.json();
      return Boolean(d?.data?.aiPowered);
    },
  });
  const aiOn = !!data;
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full backdrop-blur-sm border ${
        aiOn ? "bg-white/20 border-white/30 text-white" : "bg-amber-400/20 border-amber-200/40 text-white"
      }`}
      title={aiOn ? "OpenAI key configured — AI features active" : "No OpenAI key — using deterministic fallbacks"}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${aiOn ? "bg-emerald-300" : "bg-amber-300"}`} />
      {aiOn ? "AI live" : "Fallback mode"}
    </span>
  );
}

// ═════════════════════════════════════════════════════════════════════
// 1. TRANSCRIBE
// ═════════════════════════════════════════════════════════════════════

interface StructuredNote {
  chiefComplaint?: string;
  findings?: string;
  diagnosis?: string;
  plan?: string;
  summary?: string;
  [k: string]: unknown;
}

interface TranscribeResult {
  rawTranscript: string;
  structuredNote: StructuredNote;
  summary?: string;
  status?: string;
  id?: string;
  duration?: number;
}

interface PriorTranscript {
  id: string;
  rawTranscript?: string | null;
  summary?: string | null;
  createdAt: string;
  doctor?: { name?: string } | null;
  appointment?: { appointmentCode?: string } | null;
}

function TranscribeTab() {
  const { data: patientsResponse, isLoading: patientsLoading } = usePatients();
  const patients = (patientsResponse?.data || []) as Patient[];

  const [patientId, setPatientId] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<TranscribeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const formatTimer = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  // Prior transcriptions for the chosen patient — gives the doctor an
  // immediate sense of what's already on file before they record anything.
  const { data: priorData, refetch: refetchPrior } = useQuery({
    queryKey: ["patient-transcriptions", patientId],
    enabled: !!patientId,
    queryFn: async () => {
      const r = await fetch(`/api/patients/${patientId}/transcriptions`, { credentials: "include" });
      const d = await r.json();
      if (!d.success) throw new Error(d.error || "Failed");
      return d.data as PriorTranscript[];
    },
  });
  const priors = priorData ?? [];

  // ── Recorder lifecycle ────────────────────────────────────────────
  const start = async () => {
    setError(null);
    setResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Pick a mime type the browser actually supports. webm/opus first,
      // ogg/opus second, then whatever the browser hands us.
      const mimeCandidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
      const mime = mimeCandidates.find((m) => MediaRecorder.isTypeSupported?.(m)) || "";
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      mediaRecorderRef.current = rec;
      chunksRef.current = [];

      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        void upload(blob);
      };
      rec.start(250);

      // WebAudio analyser drives the live waveform
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new Ctx();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      audioCtxRef.current = audioCtx;
      analyserRef.current = analyser;
      drawWaveform();

      setIsRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not access microphone";
      setError(`${msg}. Make sure the browser has microphone permission.`);
    }
  };

  const stop = () => {
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;

    try {
      mediaRecorderRef.current?.stop();
    } catch { /* already stopped */ }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
  };

  const upload = async (blob: Blob) => {
    setProcessing(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("audio", blob, `consult-${Date.now()}.webm`);
      if (patientId) fd.append("patientId", patientId);
      const r = await fetch("/api/ai/transcribe", { method: "POST", body: fd, credentials: "include" });
      const d = await r.json();
      if (!d.success) throw new Error(d.error || "Transcription failed");
      setResult(d.data as TranscribeResult);
      void refetchPrior();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transcription failed");
    } finally {
      setProcessing(false);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  // ── Waveform drawing ──────────────────────────────────────────────
  const drawWaveform = () => {
    const analyser = analyserRef.current;
    const canvas = canvasRef.current;
    if (!analyser || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bufferLength = analyser.fftSize;
    const data = new Uint8Array(bufferLength);

    const render = () => {
      rafRef.current = requestAnimationFrame(render);
      analyser.getByteTimeDomainData(data);

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, "#6366f1"); // indigo-500
      grad.addColorStop(1, "#a855f7"); // purple-500
      ctx.lineWidth = 2;
      ctx.strokeStyle = grad;
      ctx.beginPath();

      const slice = w / bufferLength;
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const v = data[i] / 128.0; // 0..2
        const y = (v * h) / 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += slice;
      }
      ctx.lineTo(w, h / 2);
      ctx.stroke();
    };
    render();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-6">
      {/* Recorder */}
      <Card className="lg:col-span-3 bg-white rounded-2xl border border-stone-100 shadow-sm">
        <CardContent className="p-5 sm:p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Patient (optional)"
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              options={patients.map((p) => ({ value: p.id, label: `${p.firstName} ${p.lastName} (${p.patientCode})` }))}
              placeholder={patientsLoading ? "Loading patients..." : "No patient selected"}
            />
            <div className="text-xs text-stone-500 self-end pb-2">
              Pick a patient to save the transcript to their record. Leave blank for a one-off transcription.
            </div>
          </div>

          {/* Recorder canvas + button */}
          <div className="rounded-2xl border border-stone-100 bg-gradient-to-b from-stone-50 to-white p-5 sm:p-6">
            <canvas
              ref={canvasRef}
              width={800}
              height={120}
              className={`w-full h-[110px] rounded-xl bg-stone-50 border border-stone-100 ${isRecording ? "" : "opacity-40"}`}
            />

            <div className="flex flex-col items-center gap-4 pt-5">
              <div className="relative">
                {isRecording && (
                  <>
                    <div className="absolute inset-0 w-24 h-24 rounded-full bg-red-400/20 animate-ping" />
                    <div className="absolute inset-0 w-24 h-24 rounded-full bg-red-400/15 animate-pulse" />
                  </>
                )}
                <button
                  onClick={isRecording ? stop : start}
                  disabled={processing}
                  className={`relative w-24 h-24 rounded-full flex items-center justify-center transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    isRecording
                      ? "bg-red-500 text-white shadow-xl shadow-red-500/30"
                      : "bg-gradient-to-br from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-xl shadow-indigo-500/30"
                  }`}
                  aria-label={isRecording ? "Stop recording" : "Start recording"}
                >
                  {processing ? (
                    <Loader2 className="w-9 h-9 animate-spin" />
                  ) : isRecording ? (
                    <MicOff className="w-10 h-10" />
                  ) : (
                    <Mic className="w-10 h-10" />
                  )}
                </button>
              </div>
              <div className="text-center">
                <p className="text-3xl font-mono font-bold text-stone-900 tracking-wider">{formatTimer(seconds)}</p>
                <p className="text-xs text-stone-500 mt-1">
                  {processing
                    ? "Transcribing audio..."
                    : isRecording
                      ? "Recording — tap to stop & process"
                      : "Tap the mic to start"}
                </p>
              </div>
              {isRecording && (
                <Button variant="danger" iconLeft={<Square className="w-4 h-4" />} onClick={stop}>
                  Stop &amp; transcribe
                </Button>
              )}
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Output */}
      <Card className="lg:col-span-2 bg-white rounded-2xl border border-stone-100 shadow-sm">
        <CardContent className="p-5 sm:p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center">
                <FileText className="w-4 h-4 text-indigo-600" />
              </div>
              <h2 className="font-semibold text-stone-900">Result</h2>
            </div>
            {result?.status === "COMPLETED" && (
              <Badge variant="success">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Saved
              </Badge>
            )}
          </div>

          {!result && !processing && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-14 h-14 rounded-full bg-indigo-50 flex items-center justify-center mb-3">
                <Mic className="w-6 h-6 text-indigo-300" />
              </div>
              <p className="text-sm text-stone-400 max-w-[260px]">
                {isRecording ? "Listening… tap stop to transcribe." : "Record a consultation to see the structured note here."}
              </p>
            </div>
          )}
          {processing && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-7 h-7 text-indigo-500 animate-spin mb-2" />
              <p className="text-xs text-stone-500">Whisper + GPT working on it…</p>
            </div>
          )}
          {result && (
            <div className="space-y-4 text-sm">
              {/* Structured fields if present */}
              {Object.keys(result.structuredNote || {}).length > 0 && (
                <div className="bg-stone-50 rounded-2xl p-4 space-y-3">
                  {(["chiefComplaint", "findings", "diagnosis", "plan", "summary"] as const).map((k) => {
                    const v = result.structuredNote?.[k];
                    if (!v || typeof v !== "string") return null;
                    return (
                      <div key={k}>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 mb-0.5">
                          {k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}
                        </p>
                        <p className="text-stone-800 leading-relaxed">{v}</p>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Raw transcript collapsed by default */}
              <details className="rounded-xl border border-stone-100 bg-white">
                <summary className="cursor-pointer px-3.5 py-2.5 text-xs font-medium text-stone-700 hover:bg-stone-50 rounded-xl">
                  Show raw transcript
                </summary>
                <pre className="px-3.5 pb-3.5 pt-0.5 text-xs text-stone-600 whitespace-pre-wrap font-sans leading-relaxed">
                  {result.rawTranscript || "(no transcript)"}
                </pre>
              </details>
            </div>
          )}

          {/* Patient history */}
          {patientId && priors.length > 0 && (
            <div className="mt-5 pt-5 border-t border-stone-100">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 mb-2 flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                Recent transcripts on file
              </p>
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {priors.slice(0, 5).map((p) => (
                  <div key={p.id} className="rounded-xl border border-stone-100 bg-stone-50 px-3 py-2 text-xs">
                    <div className="flex items-center justify-between text-stone-500">
                      <span>{new Date(p.createdAt).toLocaleString()}</span>
                      {p.appointment?.appointmentCode && (
                        <span className="font-mono">{p.appointment.appointmentCode}</span>
                      )}
                    </div>
                    {p.summary && <p className="text-stone-800 mt-0.5 line-clamp-2">{p.summary}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// 2. SUMMARIZE
// ═════════════════════════════════════════════════════════════════════

interface SummarizeNote {
  id: string;
  chiefComplaint?: string | null;
  symptoms?: string | null;
  examination?: string | null;
  diagnosis?: string | null;
  treatmentPlan?: string | null;
  advice?: string | null;
  followUpDate?: string | null;
  followUpNotes?: string | null;
  createdAt: string;
  doctor?: { name?: string } | null;
}

interface SummarizeResult {
  summary: string;
  keyPoints: string[];
  aiPowered: boolean;
}

function SummarizeTab() {
  const { data: patientsResponse, isLoading: patientsLoading } = usePatients();
  const patients = (patientsResponse?.data || []) as Patient[];

  const [patientId, setPatientId] = useState("");
  const [selectedNoteId, setSelectedNoteId] = useState("");
  const [freeText, setFreeText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SummarizeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: notesData, isLoading: notesLoading } = useQuery({
    queryKey: ["patient-notes", patientId],
    enabled: !!patientId,
    queryFn: async () => {
      const r = await fetch(`/api/patients/${patientId}/notes`, { credentials: "include" });
      const d = await r.json();
      if (!d.success) throw new Error(d.error || "Failed");
      return d.data as SummarizeNote[];
    },
  });
  const notes = notesData ?? [];
  const note = notes.find((n) => n.id === selectedNoteId);

  // Compose the text payload from a selected note: every populated field
  // joined with labels so the model has clinical structure to chew on.
  const textForNote = useMemo(() => {
    if (!note) return "";
    const parts: string[] = [];
    if (note.chiefComplaint) parts.push(`Chief complaint: ${note.chiefComplaint}`);
    if (note.symptoms) parts.push(`Symptoms: ${note.symptoms}`);
    if (note.examination) parts.push(`Examination: ${note.examination}`);
    if (note.diagnosis) parts.push(`Diagnosis: ${note.diagnosis}`);
    if (note.treatmentPlan) parts.push(`Treatment plan: ${note.treatmentPlan}`);
    if (note.advice) parts.push(`Advice: ${note.advice}`);
    if (note.followUpNotes) parts.push(`Follow-up: ${note.followUpNotes}`);
    return parts.join("\n");
  }, [note]);

  const run = async () => {
    const text = note ? textForNote : freeText.trim();
    if (!text) {
      setError("Pick a consultation or paste text to summarize.");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch("/api/ai/summarize", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, type: note ? "consultation" : "general" }),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error || "Summarize failed");
      setResult({
        summary: d.data.summary,
        keyPoints: d.data.keyPoints || [],
        aiPowered: !!d.data.aiPowered,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-6">
      <Card className="lg:col-span-3 bg-white rounded-2xl border border-stone-100 shadow-sm">
        <CardContent className="p-5 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Patient"
              value={patientId}
              onChange={(e) => {
                setPatientId(e.target.value);
                setSelectedNoteId("");
                setResult(null);
              }}
              options={patients.map((p) => ({ value: p.id, label: `${p.firstName} ${p.lastName} (${p.patientCode})` }))}
              placeholder={patientsLoading ? "Loading patients..." : "Select a patient..."}
            />
            <Select
              label="Consultation"
              value={selectedNoteId}
              onChange={(e) => {
                setSelectedNoteId(e.target.value);
                setResult(null);
              }}
              disabled={!patientId || notesLoading}
              options={notes.map((n) => ({
                value: n.id,
                label: `${new Date(n.createdAt).toLocaleDateString()} · ${n.chiefComplaint?.slice(0, 40) || "Consultation"}${
                  n.doctor?.name ? ` · ${n.doctor.name}` : ""
                }`,
              }))}
              placeholder={
                !patientId ? "Pick a patient first" : notesLoading ? "Loading notes..." : notes.length === 0 ? "No notes on file" : "Pick a consultation..."
              }
            />
          </div>

          <div className="rounded-2xl border border-dashed border-stone-200 px-4 py-3 text-xs text-stone-500 flex items-center gap-2">
            <span className="font-medium text-stone-600">Or:</span> paste any clinical text below to summarize it directly.
          </div>

          <Textarea
            label="Free-form text"
            placeholder="Paste a long consultation note, lab summary, or any clinical text..."
            rows={6}
            value={freeText}
            onChange={(e) => {
              setFreeText(e.target.value);
              setSelectedNoteId("");
              setResult(null);
            }}
          />

          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              iconLeft={<RefreshCw className="w-4 h-4" />}
              onClick={() => {
                setFreeText("");
                setSelectedNoteId("");
                setResult(null);
                setError(null);
              }}
            >
              Reset
            </Button>
            <Button onClick={run} disabled={busy || (!note && !freeText.trim())} iconLeft={busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}>
              {busy ? "Working..." : "Summarize"}
            </Button>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2 bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-indigo-400 to-violet-500" />
        <CardContent className="p-5 sm:p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-violet-50 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-violet-600" />
              </div>
              <h2 className="font-semibold text-stone-900">Summary</h2>
            </div>
            {result && (
              <Badge variant={result.aiPowered ? "purple" : "default"}>
                {result.aiPowered ? "AI" : "Heuristic"}
              </Badge>
            )}
          </div>

          {!result && !busy && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-14 h-14 rounded-full bg-violet-50 flex items-center justify-center mb-3">
                <Sparkles className="w-6 h-6 text-violet-300" />
              </div>
              <p className="text-sm text-stone-400 max-w-[240px]">
                Pick a consultation or paste text, then summarize.
              </p>
            </div>
          )}

          {busy && (
            <div className="flex flex-col items-center justify-center py-10">
              <Loader2 className="w-7 h-7 text-violet-500 animate-spin mb-2" />
              <p className="text-xs text-stone-500">Compressing the note…</p>
            </div>
          )}

          {result && (
            <div className="space-y-4 text-sm">
              <div className="bg-stone-50 rounded-2xl p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 mb-1.5">Summary</p>
                <p className="text-stone-800 leading-relaxed">{result.summary}</p>
              </div>
              {result.keyPoints.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 mb-2">Key points</p>
                  <ul className="space-y-1.5">
                    {result.keyPoints.map((kp, i) => (
                      <li key={i} className="flex items-start gap-2 text-stone-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-violet-400 mt-1.5 flex-shrink-0" />
                        <span className="leading-relaxed">{kp}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// 3. ASK ABOUT PATIENT (replaces the previously-fake "Smart Search")
// ═════════════════════════════════════════════════════════════════════

interface AskContext {
  header: string;
  allergies: string[];
  medications: string[];
  recentVisits: { date: string; doctor: string; chiefComplaint: string; diagnosis: string; plan: string }[];
  recentProcedures: { date: string; treatment: string; outcome: string }[];
  recentLabs: { date: string; test: string; status: string }[];
  lastVitals: { date: string; tempC: number | null; bp: string | null; hr: number | null; bmi: number | null } | null;
}
interface AskResult {
  aiPowered: boolean;
  answer: string;
  context: AskContext;
}

const SUGGESTED_QUESTIONS = [
  "What's the patient's most recent diagnosis?",
  "Any allergies I should know about before prescribing?",
  "Summarize the last three visits in two sentences.",
  "Which procedures has this patient had this year?",
];

function AskTab() {
  const { data: patientsResponse, isLoading: patientsLoading } = usePatients();
  const patients = (patientsResponse?.data || []) as Patient[];

  const [patientId, setPatientId] = useState("");
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AskResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ask = async (q?: string) => {
    const text = (q ?? question).trim();
    if (!patientId) {
      setError("Pick a patient first.");
      return;
    }
    if (!text) {
      setError("Enter a question.");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch("/api/ai/ask-patient", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, question: text }),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error || "Failed");
      setResult(d.data as AskResult);
      if (q) setQuestion(q);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-6">
      {/* Left: composer */}
      <Card className="lg:col-span-3 bg-white rounded-2xl border border-stone-100 shadow-sm">
        <CardContent className="p-5 sm:p-6 space-y-4">
          <Select
            label="Patient"
            value={patientId}
            onChange={(e) => {
              setPatientId(e.target.value);
              setResult(null);
            }}
            options={patients.map((p) => ({ value: p.id, label: `${p.firstName} ${p.lastName} (${p.patientCode})` }))}
            placeholder={patientsLoading ? "Loading patients..." : "Select a patient..."}
          />

          <div className="space-y-2">
            <label className="text-sm font-medium text-stone-700">Your question</label>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. What treatments has this patient tried for acne?"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && ask()}
                iconLeft={<Search className="w-4 h-4" />}
              />
              <Button
                onClick={() => ask()}
                disabled={busy || !patientId || !question.trim()}
                iconLeft={busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              >
                {busy ? "Asking..." : "Ask"}
              </Button>
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 mb-2">Try one of these</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => {
                    setQuestion(q);
                    if (patientId) ask(q);
                  }}
                  className="text-xs px-3 py-1.5 rounded-full bg-stone-100 text-stone-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors cursor-pointer"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Right: answer + context */}
      <Card className="lg:col-span-2 bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-indigo-400 via-violet-400 to-fuchsia-400" />
        <CardContent className="p-5 sm:p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center">
                <Brain className="w-4 h-4 text-indigo-600" />
              </div>
              <h2 className="font-semibold text-stone-900">Answer</h2>
            </div>
            {result && (
              <Badge variant={result.aiPowered ? "purple" : "default"}>
                {result.aiPowered ? "AI" : "Chart context"}
              </Badge>
            )}
          </div>

          {!result && !busy && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-14 h-14 rounded-full bg-indigo-50 flex items-center justify-center mb-3">
                <Brain className="w-6 h-6 text-indigo-300" />
              </div>
              <p className="text-sm text-stone-400 max-w-[240px]">
                Pick a patient and ask a question. The model only sees that patient&apos;s chart.
              </p>
            </div>
          )}

          {busy && (
            <div className="flex flex-col items-center justify-center py-10">
              <Loader2 className="w-7 h-7 text-indigo-500 animate-spin mb-2" />
              <p className="text-xs text-stone-500">Reading the chart…</p>
            </div>
          )}

          {result && (
            <div className="space-y-4 text-sm">
              <div className="bg-stone-50 rounded-2xl p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 mb-1.5 flex items-center gap-1.5">
                  <UserIcon className="w-3 h-3" />
                  {result.context.header}
                </p>
                <p className="text-stone-800 leading-relaxed whitespace-pre-wrap">{result.answer}</p>
              </div>

              {/* Always show the chart slice the model used — keeps the
                  doctor in the loop and is the entire output when AI is off. */}
              <ContextDigest ctx={result.context} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ContextDigest({ ctx }: { ctx: AskContext }) {
  const blocks: { label: string; lines: string[] }[] = [
    { label: "Allergies", lines: ctx.allergies },
    { label: "Current medications", lines: ctx.medications },
    {
      label: "Recent visits",
      lines: ctx.recentVisits.map(
        (v) => `${v.date} · ${v.doctor} — ${v.chiefComplaint || "(no complaint)"}${v.diagnosis ? ` → ${v.diagnosis}` : ""}`
      ),
    },
    {
      label: "Recent procedures",
      lines: ctx.recentProcedures.map((p) => `${p.date} · ${p.treatment}${p.outcome ? ` (${p.outcome})` : ""}`),
    },
    { label: "Recent labs", lines: ctx.recentLabs.map((l) => `${l.date} · ${l.test} — ${l.status}`) },
  ];
  if (ctx.lastVitals) {
    const v = ctx.lastVitals;
    const parts = [
      v.tempC ? `${v.tempC}°C` : null,
      v.bp ? `BP ${v.bp}` : null,
      v.hr ? `HR ${v.hr}` : null,
      v.bmi ? `BMI ${v.bmi}` : null,
    ].filter(Boolean);
    blocks.push({ label: "Last vitals", lines: parts.length ? [`${v.date} · ${parts.join(" · ")}`] : [] });
  }

  return (
    <details className="rounded-xl border border-stone-100 bg-white">
      <summary className="cursor-pointer px-3.5 py-2.5 text-xs font-medium text-stone-700 hover:bg-stone-50 rounded-xl">
        What the model saw
      </summary>
      <div className="px-3.5 pb-3.5 pt-1 space-y-3">
        {blocks.map((b) => (
          <div key={b.label}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 mb-1">{b.label}</p>
            {b.lines.length > 0 ? (
              <ul className="space-y-0.5 text-xs text-stone-700">
                {b.lines.map((l, i) => (
                  <li key={i}>· {l}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-stone-400 italic">None on file.</p>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}
