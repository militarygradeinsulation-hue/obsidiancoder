// Voice control for the Obsidian composer.
//
// Uses the Web Speech API (SpeechRecognition) — zero external deps, zero
// server calls, zero cost. Runs entirely in the browser.
//
// Command vocabulary (case-insensitive, recognized on FINAL results):
//   "send" / "send it" / "build it" / "go" / "ship it"  → submit
//   "expand" / "expand idea" / "add more" / "keep going" → expandDraft
//   "enhance" / "make it better" / "polish"              → enhancePrompt
//   "clear" / "clear prompt" / "start over" / "wipe"     → setInput('')
//   "new line" / "new paragraph"                          → append '\n'
//   "period" / "full stop"                                → append '.'
//   "comma" / "question mark" / "exclamation"             → punctuation
//   "plan mode" / "plan first"                            → togglePlan
//   "screenshot" / "take screenshot"                      → screenshot
//   "stop listening" / "microphone off" / "mic off"       → stops the mic
//
// Any speech that is NOT a command is appended to the composer input as
// normal dictation. Interim (in-progress) results are surfaced via the
// `interim` state so the UI can show a live caption.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type VoiceCommand =
  | "send"
  | "expand"
  | "enhance"
  | "clear"
  | "plan"
  | "screenshot"
  | "stop";

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: { transcript: string; confidence: number };
  length: number;
};
type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};
type SpeechRecognitionErrorLike = { error: string; message?: string };
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives?: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
};

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isVoiceControlSupported(): boolean {
  return getRecognitionCtor() !== null;
}

// Normalize a phrase for command matching: strip trailing punctuation and
// collapse whitespace. Keeps the raw text intact for dictation.
function normalize(phrase: string): string {
  return phrase
    .toLowerCase()
    .replace(/[.!?,;:]+\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Command phrases → canonical command. Longest phrases are matched first
// so "send it" wins over "send".
const COMMAND_PHRASES: Array<{ phrase: string; cmd: VoiceCommand }> = [
  // send
  { phrase: "send it now", cmd: "send" },
  { phrase: "send it", cmd: "send" },
  { phrase: "ship it", cmd: "send" },
  { phrase: "build it", cmd: "send" },
  { phrase: "build this", cmd: "send" },
  { phrase: "make it", cmd: "send" },
  { phrase: "go build", cmd: "send" },
  { phrase: "send", cmd: "send" },
  { phrase: "go", cmd: "send" },
  // expand
  { phrase: "expand idea", cmd: "expand" },
  { phrase: "expand more", cmd: "expand" },
  { phrase: "expand it", cmd: "expand" },
  { phrase: "keep going", cmd: "expand" },
  { phrase: "add more", cmd: "expand" },
  { phrase: "more ideas", cmd: "expand" },
  { phrase: "expand", cmd: "expand" },
  // enhance
  { phrase: "make it better", cmd: "enhance" },
  { phrase: "polish it", cmd: "enhance" },
  { phrase: "enhance prompt", cmd: "enhance" },
  { phrase: "enhance", cmd: "enhance" },
  { phrase: "polish", cmd: "enhance" },
  // clear
  { phrase: "clear prompt", cmd: "clear" },
  { phrase: "clear it", cmd: "clear" },
  { phrase: "start over", cmd: "clear" },
  { phrase: "wipe it", cmd: "clear" },
  { phrase: "clear", cmd: "clear" },
  // plan
  { phrase: "plan mode", cmd: "plan" },
  { phrase: "plan first", cmd: "plan" },
  // screenshot
  { phrase: "take screenshot", cmd: "screenshot" },
  { phrase: "take a screenshot", cmd: "screenshot" },
  { phrase: "screenshot", cmd: "screenshot" },
  // stop
  { phrase: "stop listening", cmd: "stop" },
  { phrase: "microphone off", cmd: "stop" },
  { phrase: "mic off", cmd: "stop" },
  { phrase: "stop mic", cmd: "stop" },
];

// Inline punctuation substitutions applied to dictated text.
const PUNCT: Array<[RegExp, string]> = [
  [/\bnew paragraph\b/gi, "\n\n"],
  [/\bnew line\b/gi, "\n"],
  [/\bfull stop\b/gi, "."],
  [/\bperiod\b/gi, "."],
  [/\bcomma\b/gi, ","],
  [/\bquestion mark\b/gi, "?"],
  [/\bexclamation( mark| point)?\b/gi, "!"],
];

// Detect a command at the END of an utterance. Returns { command, leading }
// where `leading` is any dictation the user said BEFORE the command word
// (e.g. "make a login page send" → leading "make a login page", cmd send).
export function detectCommand(text: string): { cmd: VoiceCommand; leading: string } | null {
  const norm = normalize(text);
  if (!norm) return null;
  for (const { phrase, cmd } of COMMAND_PHRASES) {
    if (norm === phrase) return { cmd, leading: "" };
    if (norm.endsWith(" " + phrase)) {
      const leading = norm.slice(0, norm.length - phrase.length - 1).trim();
      return { cmd, leading };
    }
  }
  return null;
}

// Turn raw dictation into text ready to append: apply punctuation subs,
// capitalize first letter when appending to an empty draft.
export function formatDictation(raw: string, priorText: string): string {
  let out = raw;
  for (const [re, rep] of PUNCT) out = out.replace(re, rep);
  out = out.replace(/\s+([.,?!])/g, "$1").replace(/\s{2,}/g, " ").trim();
  if (!out) return "";
  const needsSpace = priorText.length > 0 && !/[\s\n]$/.test(priorText);
  const capitalize = priorText.length === 0 || /[.!?]\s*$/.test(priorText.trimEnd());
  if (capitalize) out = out.charAt(0).toUpperCase() + out.slice(1);
  return (needsSpace ? " " : "") + out;
}

export type VoiceControlOptions = {
  onDictate: (append: string, full: string) => void;
  onCommand: (cmd: VoiceCommand) => void;
  getDraft: () => string;
  lang?: string;
};

export function useVoiceControl(opts: VoiceControlOptions) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const wantOnRef = useRef(false);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const supported = useMemo(isVoiceControlSupported, []);

  const stop = useCallback(() => {
    wantOnRef.current = false;
    try { recRef.current?.stop(); } catch { /* noop */ }
    setListening(false);
    setInterim("");
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setError("Voice control isn't supported in this browser. Try Chrome, Edge, or Safari.");
      return;
    }
    setError(null);
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = opts.lang ?? (typeof navigator !== "undefined" ? navigator.language || "en-US" : "en-US");
    rec.maxAlternatives = 1;

    rec.onstart = () => setListening(true);
    rec.onend = () => {
      setListening(false);
      setInterim("");
      // Auto-restart while the user still wants the mic on (Chrome ends
      // sessions periodically even in continuous mode).
      if (wantOnRef.current) {
        try { rec.start(); } catch { /* already started */ }
      }
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setError("Microphone permission was denied. Enable it in your browser settings to use voice control.");
        wantOnRef.current = false;
      } else {
        setError(`Voice error: ${e.error}`);
      }
    };
    rec.onresult = (event) => {
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const alt = result[0];
        if (!alt) continue;
        const transcript = alt.transcript;
        if (result.isFinal) {
          const detection = detectCommand(transcript);
          const draft = optsRef.current.getDraft();
          if (detection) {
            // If the user prefixed the command with dictation ("make a
            // pricing page send") append that portion first, then fire.
            if (detection.leading) {
              const formatted = formatDictation(detection.leading, draft);
              if (formatted) optsRef.current.onDictate(formatted, draft + formatted);
            }
            optsRef.current.onCommand(detection.cmd);
            if (detection.cmd === "stop") {
              wantOnRef.current = false;
              try { recRef.current?.stop(); } catch { /* noop */ }
              setListening(false);
              setInterim("");
            }
          } else {
            const formatted = formatDictation(transcript, draft);
            if (formatted) optsRef.current.onDictate(formatted, draft + formatted);
          }
        } else {
          interimText += transcript;
        }
      }
      setInterim(interimText.trim());
    };

    recRef.current = rec;
    wantOnRef.current = true;
    try {
      rec.start();
    } catch {
      // Some browsers throw if start() is called back-to-back.
      wantOnRef.current = false;
    }
  }, [opts.lang]);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  useEffect(() => {
    return () => {
      wantOnRef.current = false;
      try { recRef.current?.abort(); } catch { /* noop */ }
    };
  }, []);

  return { supported, listening, interim, error, start, stop, toggle };
}
