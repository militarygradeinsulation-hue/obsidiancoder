// Reliable voice control for the Obsidian composer.
// Records complete PCM WAV windows and transcribes them server-side.
import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceCommand = "send" | "expand" | "enhance" | "clear" | "plan" | "screenshot" | "stop";

const COMMAND_PHRASES: Array<{ phrase: string; cmd: VoiceCommand }> = [
  { phrase: "send it now", cmd: "send" }, { phrase: "send it", cmd: "send" },
  { phrase: "ship it", cmd: "send" }, { phrase: "build it", cmd: "send" },
  { phrase: "build this", cmd: "send" }, { phrase: "make it", cmd: "send" },
  { phrase: "go build", cmd: "send" }, { phrase: "send", cmd: "send" }, { phrase: "go", cmd: "send" },
  { phrase: "expand idea", cmd: "expand" }, { phrase: "expand more", cmd: "expand" },
  { phrase: "expand it", cmd: "expand" }, { phrase: "keep going", cmd: "expand" },
  { phrase: "add more", cmd: "expand" }, { phrase: "more ideas", cmd: "expand" }, { phrase: "expand", cmd: "expand" },
  { phrase: "make it better", cmd: "enhance" }, { phrase: "polish it", cmd: "enhance" },
  { phrase: "enhance prompt", cmd: "enhance" }, { phrase: "enhance", cmd: "enhance" }, { phrase: "polish", cmd: "enhance" },
  { phrase: "clear prompt", cmd: "clear" }, { phrase: "clear it", cmd: "clear" },
  { phrase: "start over", cmd: "clear" }, { phrase: "wipe it", cmd: "clear" }, { phrase: "clear", cmd: "clear" },
  { phrase: "plan mode", cmd: "plan" }, { phrase: "plan first", cmd: "plan" },
  { phrase: "take screenshot", cmd: "screenshot" }, { phrase: "take a screenshot", cmd: "screenshot" },
  { phrase: "screenshot", cmd: "screenshot" }, { phrase: "stop listening", cmd: "stop" },
  { phrase: "microphone off", cmd: "stop" }, { phrase: "mic off", cmd: "stop" }, { phrase: "stop mic", cmd: "stop" },
];

const PUNCT: Array<[RegExp, string]> = [
  [/\bnew paragraph\b/gi, "\n\n"], [/\bnew line\b/gi, "\n"],
  [/\bfull stop\b/gi, "."], [/\bperiod\b/gi, "."], [/\bcomma\b/gi, ","],
  [/\bquestion mark\b/gi, "?"], [/\bexclamation( mark| point)?\b/gi, "!"],
];

function normalize(text: string): string {
  return text.toLowerCase().replace(/[.!?,;:]+\s*$/g, "").replace(/\s+/g, " ").trim();
}

export function detectCommand(text: string): { cmd: VoiceCommand; leading: string } | null {
  const normalized = normalize(text);
  if (!normalized) return null;
  for (const { phrase, cmd } of COMMAND_PHRASES) {
    if (normalized === phrase) return { cmd, leading: "" };
    if (normalized.endsWith(` ${phrase}`)) {
      return { cmd, leading: normalized.slice(0, normalized.length - phrase.length - 1).trim() };
    }
  }
  return null;
}

export function formatDictation(raw: string, priorText: string): string {
  let output = raw;
  for (const [pattern, replacement] of PUNCT) output = output.replace(pattern, replacement);
  output = output.replace(/\s+([.,?!])/g, "$1").replace(/\s{2,}/g, " ").trim();
  if (!output) return "";
  if (priorText.length === 0 || /[.!?]\s*$/.test(priorText.trimEnd())) {
    output = output.charAt(0).toUpperCase() + output.slice(1);
  }
  return `${priorText.length > 0 && !/[\s\n]$/.test(priorText) ? " " : ""}${output}`;
}

type AudioSession = {
  stream: MediaStream;
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  processor: ScriptProcessorNode;
  mute: GainNode;
  timer: number;
};

function getAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  const browserWindow = window as typeof window & { webkitAudioContext?: typeof AudioContext };
  return window.AudioContext ?? browserWindow.webkitAudioContext ?? null;
}

export function isVoiceControlSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && !!getAudioContextCtor();
}

function encodeWav(chunks: Float32Array[], sourceRate: number): Blob {
  const sourceLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const source = new Float32Array(sourceLength);
  let offset = 0;
  for (const chunk of chunks) { source.set(chunk, offset); offset += chunk.length; }
  const targetRate = 16_000;
  const ratio = sourceRate / targetRate;
  const targetLength = Math.max(1, Math.floor(source.length / ratio));
  const pcm = new Int16Array(targetLength);
  for (let i = 0; i < targetLength; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(source.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += source[j] ?? 0;
    const sample = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
    pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  const buffer = new ArrayBuffer(44 + pcm.byteLength);
  const view = new DataView(buffer);
  const writeText = (at: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i));
  };
  writeText(0, "RIFF"); view.setUint32(4, 36 + pcm.byteLength, true); writeText(8, "WAVE");
  writeText(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, targetRate, true); view.setUint32(28, targetRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  writeText(36, "data"); view.setUint32(40, pcm.byteLength, true);
  for (let i = 0; i < pcm.length; i++) view.setInt16(44 + i * 2, pcm[i] ?? 0, true);
  return new Blob([buffer], { type: "audio/wav" });
}

async function transcribe(audio: Blob, signal: AbortSignal): Promise<string> {
  const body = new FormData();
  body.append("file", audio, "recording.wav");
  const response = await fetch("/api/transcribe", { method: "POST", body, signal });
  if (!response.ok || !response.body) throw new Error(await response.text().catch(() => "Transcription failed."));
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let transcript = "";
  const consume = (line: string) => {
    if (!line.startsWith("data:")) return;
    try {
      const event = JSON.parse(line.slice(5).trim()) as { type?: string; delta?: string; text?: string };
      if (event.type === "transcript.text.delta" && event.delta) transcript += event.delta;
      if (event.type === "transcript.text.done" && typeof event.text === "string") transcript = event.text;
    } catch { /* SSE keepalive */ }
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? "";
    lines.forEach(consume);
  }
  if (pending) consume(pending);
  return transcript.trim();
}

export type VoiceControlOptions = {
  onDictate: (append: string, full: string) => void;
  onCommand: (cmd: VoiceCommand) => void;
  getDraft: () => string;
  lang?: string;
};

export function useVoiceControl(opts: VoiceControlOptions) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const optsRef = useRef(opts);
  const sessionRef = useRef<AudioSession | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const energyRef = useRef({ sum: 0, count: 0 });
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const controllersRef = useRef(new Set<AbortController>());
  const startingRef = useRef(false);
  const mountedRef = useRef(true);
  optsRef.current = opts;

  useEffect(() => setSupported(isVoiceControlSupported()), []);

  const cleanup = useCallback((abortRequests: boolean) => {
    const session = sessionRef.current;
    sessionRef.current = null;
    if (session) {
      window.clearInterval(session.timer);
      session.processor.onaudioprocess = null;
      session.processor.disconnect(); session.source.disconnect(); session.mute.disconnect();
      session.stream.getTracks().forEach((track) => track.stop());
      void session.context.close().catch(() => {});
    }
    if (abortRequests) {
      controllersRef.current.forEach((controller) => controller.abort());
      controllersRef.current.clear();
    }
    chunksRef.current = []; energyRef.current = { sum: 0, count: 0 };
    if (mountedRef.current) { setListening(false); setProcessing(false); setInterim(""); setLevel(0); }
  }, []);

  const handleTranscript = useCallback((raw: string) => {
    if (!raw) return;
    setInterim(raw);
    const detection = detectCommand(raw);
    const draft = optsRef.current.getDraft();
    if (detection) {
      if (detection.leading) {
        const formatted = formatDictation(detection.leading, draft);
        if (formatted) optsRef.current.onDictate(formatted, draft + formatted);
      }
      window.setTimeout(() => optsRef.current.onCommand(detection.cmd), 0);
      if (detection.cmd === "stop") cleanup(true);
    } else {
      const formatted = formatDictation(raw, draft);
      if (formatted) optsRef.current.onDictate(formatted, draft + formatted);
    }
    window.setTimeout(() => { if (mountedRef.current) setInterim(""); }, 1800);
  }, [cleanup]);

  const flush = useCallback(() => {
    const session = sessionRef.current;
    const chunks = chunksRef.current;
    const energy = energyRef.current;
    chunksRef.current = []; energyRef.current = { sum: 0, count: 0 };
    if (!session || chunks.length === 0 || energy.count === 0) return;
    const rms = Math.sqrt(energy.sum / energy.count);
    const sampleCount = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    if (rms < 0.004 || sampleCount < session.context.sampleRate * 0.3) return;
    const wav = encodeWav(chunks, session.context.sampleRate);
    queueRef.current = queueRef.current.then(async () => {
      if (!mountedRef.current) return;
      const controller = new AbortController();
      controllersRef.current.add(controller); setProcessing(true);
      try { handleTranscript(await transcribe(wav, controller.signal)); }
      catch {
        if (!controller.signal.aborted) setError("I couldn't transcribe that. Check your connection and try again.");
      } finally {
        controllersRef.current.delete(controller); if (mountedRef.current) setProcessing(false);
      }
    });
  }, [handleTranscript]);

  const stop = useCallback(() => { flush(); cleanup(false); }, [cleanup, flush]);

  const start = useCallback(async () => {
    if (startingRef.current || sessionRef.current) return;
    const Ctor = getAudioContextCtor();
    if (!Ctor || !navigator.mediaDevices?.getUserMedia) { setError("Voice control isn't supported in this browser."); return; }
    startingRef.current = true; setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (!mountedRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      const context = new Ctor(); await context.resume();
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      const mute = context.createGain(); mute.gain.value = 0;
      source.connect(processor); processor.connect(mute); mute.connect(context.destination);
      processor.onaudioprocess = (event) => {
        const samples = new Float32Array(event.inputBuffer.getChannelData(0));
        chunksRef.current.push(samples);
        let energy = 0; for (let i = 0; i < samples.length; i++) energy += (samples[i] ?? 0) ** 2;
        energyRef.current.sum += energy; energyRef.current.count += samples.length;
        setLevel(Math.min(1, Math.sqrt(energy / Math.max(1, samples.length)) * 18));
      };
      const timer = window.setInterval(flush, 3000);
      sessionRef.current = { stream, context, source, processor, mute, timer };
      setListening(true);
    } catch (captureError) {
      const name = captureError instanceof DOMException ? captureError.name : "";
      setError(name === "NotAllowedError" ? "Microphone access was blocked. Allow it for this site, then try again." : "No working microphone was found. Check your input device and try again.");
      cleanup(true);
    } finally { startingRef.current = false; }
  }, [cleanup, flush]);

  const toggle = useCallback(() => { if (sessionRef.current || listening) stop(); else void start(); }, [listening, start, stop]);
  useEffect(() => () => { mountedRef.current = false; cleanup(true); }, [cleanup]);

  return { supported, listening, processing, interim, error, level, start, stop, toggle };
}