import { createFileRoute } from "@tanstack/react-router";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export const Route = createFileRoute("/api/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const declaredLength = Number(request.headers.get("content-length") ?? "0");
        if (declaredLength > MAX_AUDIO_BYTES + 64_000) return new Response("Recording is too large.", { status: 413 });
        if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("multipart/form-data")) {
          return new Response("Expected an audio upload.", { status: 400 });
        }
        const form = await request.formData();
        const audio = form.get("file");
        if (!(audio instanceof File) || audio.size < 2_048) return new Response("That recording was empty. Please try again.", { status: 400 });
        if (audio.size > MAX_AUDIO_BYTES) return new Response("Recording is too large.", { status: 413 });
        if (audio.type.split(";")[0] !== "audio/wav") return new Response("Only complete WAV recordings are accepted.", { status: 415 });
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return new Response("Voice transcription is unavailable.", { status: 503 });

        const upstream = new FormData();
        upstream.append("model", "openai/gpt-4o-mini-transcribe");
        upstream.append("file", audio, "recording.wav");
        upstream.append("stream", "true");
        const response = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
          method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: upstream,
        });
        if (!response.ok) {
          const message = await response.text().catch(() => "");
          return new Response(message || "Transcription failed.", { status: response.status });
        }
        return new Response(response.body, {
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store" },
        });
      },
    },
  },
});