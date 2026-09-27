import { useRef, useState } from "react";
import { Globe, ImagePlus, Volume2, Loader2, Square } from "lucide-react";
import { toast } from "sonner";
import { authFetch } from "@/lib/auth-fetch";

interface Props {
  disabled?: boolean;
  onInsert: (text: string) => void;
  getLastReply: () => string;
}

async function readError(res: Response) {
  const d = await res.json().catch(() => null) as any;
  return d?.message || d?.error || `Request failed (${res.status})`;
}

/** Paid-member composer powers: Build from URL, AI image, read aloud. */
export function PowerTools({ disabled, onInsert, getLastReply }: Props) {
  const [busy, setBusy] = useState<null | "scrape" | "image" | "speak">(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function call(body: object) {
    return authFetch("/api/powers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function fromUrl() {
    const url = window.prompt("Paste a website to build from:")?.trim();
    if (!url) return;
    setBusy("scrape");
    try {
      const res = await call({ action: "scrape", url: /^https?:\/\//i.test(url) ? url : `https://${url}` });
      if (!res.ok) return toast.error(await readError(res));
      const { brief } = await res.json();
      onInsert(`Build a site inspired by this reference — match its structure and feel, but write fully original copy and design details:\n${brief}`);
      toast.success("Reference added to your prompt");
    } finally { setBusy(null); }
  }

  async function makeImage() {
    const prompt = window.prompt("Describe the image you want in the build:")?.trim();
    if (!prompt) return;
    setBusy("image");
    try {
      const res = await call({ action: "image", prompt, wide: true });
      if (!res.ok) return toast.error(await readError(res));
      const { url } = await res.json();
      onInsert(`Use this generated image (${prompt}) in the build: ${url}`);
      toast.success("Image created and added to your prompt");
    } finally { setBusy(null); }
  }

  async function speak() {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; setBusy(null); return; }
    const text = getLastReply().replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 2400);
    if (!text) return toast.info("Nothing to read yet.");
    setBusy("speak");
    try {
      const res = await call({ action: "speak", text });
      if (!res.ok) { setBusy(null); return toast.error(await readError(res)); }
      const audio = new Audio(URL.createObjectURL(await res.blob()));
      audioRef.current = audio;
      audio.onended = () => { audioRef.current = null; setBusy(null); };
      await audio.play();
    } catch { audioRef.current = null; setBusy(null); }
  }

  const off = disabled || (busy !== null && busy !== "speak");
  return (
    <>
      <button type="button" className="obs-composer-attach" aria-label="Build from a website" title="Build from URL — paste a site to use as a reference (paid)" disabled={off} onClick={fromUrl}>
        {busy === "scrape" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
      </button>
      <button type="button" className="obs-composer-attach" aria-label="Create an AI image" title="AI image — create a custom image for the build (paid)" disabled={off} onClick={makeImage}>
        {busy === "image" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
      </button>
      <button type="button" className="obs-composer-attach" aria-label={busy === "speak" ? "Stop reading" : "Read the latest reply aloud"} title="Read aloud — hear the latest reply (paid)" disabled={disabled} onClick={speak}>
        {busy === "speak" ? <Square className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
      </button>
    </>
  );
}
