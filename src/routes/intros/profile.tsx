import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Bell,
  Calendar,
  ChevronRight,
  Eye,
  GraduationCap,
  Handshake,
  Heart,
  Linkedin,
  Mail,
  MapPin,
  MessageCircle,
  Plus,
  Search,
  Share2,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import { IntrosShell, Page } from "@/components/intros/shell";
import {
  InitialsAvatar,
  Panel,
  Plate,
  Ring,
  Creed,
  Tag,
  IconLine,
} from "@/components/intros/primitives";
import { elena } from "@/lib/intros-data";

export const Route = createFileRoute("/intros/profile")({
  head: () => ({ meta: [{ title: `Aetheris Intros — ${elena.name}` }] }),
  component: ProfilePage,
});

const TABS = ["Overview", "Intros", "Network", "Insights", "Activity"];

const CONTROLS = [
  { icon: Users, k: "Introduction preference", v: "Open to introductions" },
  { icon: Eye, k: "Profile visibility", v: "Visible to network" },
  { icon: Target, k: "Relationship status", v: "Not yet connected" },
  { icon: Bell, k: "Update activity", v: "Get notified" },
];

function ProfilePage() {
  const [tab, setTab] = useState("Overview");

  return (
    <IntrosShell>
      {/* masthead */}
      <section className="border-b border-border/60 px-6 py-10">
        <div className="mx-auto grid max-w-[1400px] gap-8 lg:grid-cols-[320px_1fr_300px]">
          <Plate className="h-64 p-6">
            <Creed lines={["People", "Ideas", "Capital", "for a more", "resilient", "tomorrow."]} />
          </Plate>

          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Professional profile
            </p>
            <h1 className="mt-2 font-serif text-4xl font-semibold">
              {elena.first} <span className="text-primary">{elena.last}</span>
            </h1>
            <h2 className="mt-1 text-lg font-medium leading-snug text-foreground/85">
              {elena.role}
              <br />
              {elena.company}
            </h2>
            <div className="mt-3 flex items-center gap-3 text-[13px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" /> {elena.location}
              </span>
              <Linkedin className="h-4 w-4 text-primary" />
            </div>
            <p className="mt-4 max-w-[48ch] text-[15px] leading-relaxed text-muted-foreground">
              {elena.summary}
            </p>
            <blockquote className="mt-5 border-l border-border pl-4">
              <p className="font-serif text-base leading-snug">"{elena.quote}"</p>
              <p className="mt-2 text-[11px] text-muted-foreground">— {elena.name}</p>
            </blockquote>
          </div>

          <div className="flex flex-col gap-2">
            {CONTROLS.map((c) => (
              <button
                key={c.k}
                className="flex items-center gap-3 rounded-md border border-border px-3 py-2.5 text-left hover:bg-white/5 transition"
              >
                <c.icon className="h-[17px] w-[17px] flex-none text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] text-muted-foreground">{c.k}</span>
                  <span className="block text-[12.5px] font-medium">{c.v}</span>
                </span>
                <ChevronRight className="h-3.5 w-3.5 flex-none text-muted-foreground" />
              </button>
            ))}
            <button className="mt-1.5 flex items-center justify-center gap-2 rounded-md bg-primary py-2.5 text-[13px] font-medium text-primary-foreground hover:opacity-90 transition">
              <Mail className="h-[15px] w-[15px]" /> Request introduction
            </button>
            <button className="flex items-center justify-center gap-2 rounded-md border border-border py-2.5 text-[13px] hover:bg-white/5 transition">
              <Calendar className="h-[15px] w-[15px]" /> Book a call
            </button>
            <button className="flex items-center justify-center gap-2 rounded-md border border-border py-2.5 text-[13px] hover:bg-white/5 transition">
              <Plus className="h-[15px] w-[15px]" /> Save to network
            </button>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-1 border-b border-border/60 px-6">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3.5 py-3 text-[13px] transition ${
              tab === t
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
        <span className="ml-auto hidden text-[11px] text-muted-foreground sm:block">
          People × Context × Opportunity
        </span>
      </div>

      <Page>
        <div className="grid gap-4 lg:grid-cols-5">
          <Panel title={`About ${elena.first}`} action="kebab" className="lg:col-span-1">
            <p className="mb-3 text-[12.5px] leading-relaxed text-muted-foreground">
              {elena.about}
            </p>
            {elena.credentials.map((c) => (
              <IconLine
                key={c}
                icon={<GraduationCap className="mt-0.5 h-4 w-4 text-muted-foreground" />}
              >
                {c}
              </IconLine>
            ))}
          </Panel>

          <Panel title="Focus areas" action="kebab">
            <div className="flex flex-wrap gap-1.5">
              {elena.focus.map((f) => (
                <Tag key={f}>{f}</Tag>
              ))}
            </div>
          </Panel>

          <Panel title="Goals" action="kebab">
            {elena.goals.map((g) => (
              <IconLine key={g} icon={<Target className="mt-0.5 h-4 w-4 text-primary" />}>
                {g}
              </IconLine>
            ))}
          </Panel>

          <Panel title="Can help with" action="kebab">
            <div className="flex items-start gap-3">
              <Handshake className="mt-0.5 h-6 w-6 flex-none text-muted-foreground" />
              <ul className="list-none text-[12.5px] leading-relaxed text-muted-foreground">
                {elena.helpWith.map((h) => (
                  <li key={h} className="py-0.5">
                    {h}
                  </li>
                ))}
              </ul>
            </div>
          </Panel>

          <Panel title="Compatibility insights" action="kebab">
            <div className="mb-3 flex justify-between">
              {elena.compatibility.map((c) => (
                <Ring key={c.label} value={c.value} label={c.label} note={c.note} size={62} />
              ))}
            </div>
            <div className="mb-2 h-px bg-border" />
            {elena.readouts.map((r) => (
              <div key={r.v} className="flex items-center gap-2 py-1 text-[12px]">
                <Sparkles className="h-3.5 w-3.5 flex-none text-primary" />
                <span className="font-medium">{r.k}</span>
                <span className="text-muted-foreground">{r.v}</span>
              </div>
            ))}
          </Panel>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[2fr_1.3fr]">
          <Panel title="Currently looking for" action="kebab">
            <div className="flex items-start gap-3">
              <Search className="mt-0.5 h-6 w-6 flex-none text-muted-foreground" />
              <ul className="list-none text-[12.5px] leading-relaxed text-muted-foreground">
                {elena.lookingFor.map((l) => (
                  <li key={l} className="py-1">
                    {l}
                  </li>
                ))}
              </ul>
            </div>
          </Panel>

          <Panel title="Availability">
            <p className="mb-3 text-[12.5px] text-muted-foreground">
              Next available slots, synced from calendar.
            </p>
            <div className="grid grid-cols-3 gap-2 text-center text-[11.5px]">
              {["Tue 10:00", "Wed 2:30", "Thu 9:00"].map((s) => (
                <button
                  key={s}
                  className="rounded-md border border-border py-2 hover:border-primary/50 hover:text-primary transition"
                >
                  {s}
                </button>
              ))}
            </div>
          </Panel>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Panel title="Shared connections (3)" action="View all">
            {elena.sharedConnections.map((c) => (
              <div
                key={c.name}
                className="flex items-center gap-2.5 border-b border-border/60 py-2 last:border-0"
              >
                <InitialsAvatar name={c.name} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-medium">{c.name}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{c.role}</div>
                </div>
                <Tag>{c.degree}</Tag>
              </div>
            ))}
          </Panel>

          <Panel title="Relationship history" action="kebab">
            {elena.history.map((h) => (
              <div key={h.t} className="border-b border-border/60 py-2 last:border-0">
                <div className="text-[12px] leading-snug">{h.t}</div>
                <div className="mt-0.5 text-[10.5px] text-muted-foreground">{h.d}</div>
              </div>
            ))}
          </Panel>

          <Panel title="Recent activity" action="View all">
            {elena.activity.map((a) => (
              <div
                key={a.title}
                className="flex items-start gap-2.5 border-b border-border/60 py-2.5 last:border-0"
              >
                <InitialsAvatar name={elena.name} size={34} square />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[12.5px] font-medium">{elena.name}</span>
                    <span className="flex-none text-[10.5px] text-muted-foreground">{a.time}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">{a.kind}</div>
                  <div className="mt-1 text-[12.5px] leading-snug">{a.title}</div>
                  <div className="mt-1.5 flex gap-3 text-[10.5px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Heart className="h-3 w-3" /> {a.likes}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageCircle className="h-3 w-3" /> {a.comments}
                    </span>
                    {"shares" in a && a.shares && (
                      <span className="flex items-center gap-1">
                        <Share2 className="h-3 w-3" /> {a.shares}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </Panel>

          <Panel title={`Recent insights from ${elena.first}`} action="View all">
            {elena.insights.map((i) => (
              <div
                key={i.title}
                className="flex items-start gap-2.5 border-b border-border/60 py-2.5 last:border-0"
              >
                <Plate className="h-14 w-[74px] flex-none" />
                <div>
                  <div className="text-[11px] text-primary">{i.kind}</div>
                  <div className="mt-1 text-[12.5px] leading-snug">{i.title}</div>
                  <div className="mt-1 text-[10.5px] text-muted-foreground">{i.date}</div>
                </div>
              </div>
            ))}
          </Panel>
        </div>
      </Page>
    </IntrosShell>
  );
}
