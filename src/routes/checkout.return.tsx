import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/checkout/return")({
  validateSearch: (s: Record<string, unknown>): { session_id?: string } => ({
    session_id: typeof s.session_id === "string" ? s.session_id : undefined,
  }),
  component: ReturnPage,
  head: () => ({ meta: [{ title: "Payment complete — Aetheris Obsidian" }] }),
});

function ReturnPage() {
  const { session_id } = Route.useSearch();
  return (
    <div className="min-h-screen bg-[#050607] flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-[#c9953d]/30 bg-[#0a0b0d] p-8 text-center shadow-2xl">
        <CheckCircle2 className="mx-auto h-12 w-12 text-[#F4A125]" />
        <h1 className="mt-4 text-xl font-semibold text-[#f2eee7]">You're in.</h1>
        <p className="mt-2 text-sm text-[#B6BCC8]">
          Your purchase is confirmed. A receipt is on the way to your inbox. Your account is unlocked — head back into Aetheris Obsidian to start building.
        </p>
        {session_id && (
          <p className="mt-3 text-[10px] text-[#B6BCC8]/60 break-all">Session: {session_id}</p>
        )}
        <Link
          to="/"
          className="mt-6 inline-flex px-4 py-2 rounded-md bg-[#F4A125] hover:bg-[#DD9324] text-black text-sm font-semibold"
        >
          Back to Obsidian
        </Link>
      </div>
    </div>
  );
}
