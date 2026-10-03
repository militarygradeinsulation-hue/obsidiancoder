import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Bell,
  Eye,
  GraduationCap,
  Handshake,
  Linkedin,
  MapPin,
  Search,
  Share2,
  Target,
  Users,
} from "lucide-react";
import { IntrosShell, Page } from "@/components/intros/shell";
import { Panel, Plate, Creed, Tag, IconLine, StatLine } from "@/components/intros/primitives";
import { me } from "@/lib/intros-data";

export const Route = createFileRoute("/intros/profile")({
  head: () => ({ meta: [{ title: `Aetheris Intros — ${me.name}` }] }),
  component: MyProfilePage,
});

const CONTROLS = [
  { icon: Users, k: "Introduction preference", v: "Open to introductions" },
  { icon: Eye, k: "Profile visibility", v: "Visible to network" },
  { icon: Users, k: "Who can contact you", v: "People in my network" },
  { icon: Bell, k: "Notification frequency", v: "Daily digest" },
];

function MyProfilePage() {
  return (
    <IntrosShell>
      {/* masthead */}
      <section className="border-b border-border/60 px-6 py-10">
        <div className="mx-auto grid max-w-[1400px] gap-8 lg:grid-cols-[320px_1fr_300px]">
          <Plate className="h-64 p-6">
            <Creed lines={["Build", "the infrastructure", "others build on."]} />
          </Plate>

          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Your professional profile
            </p>
            <h1 className="mt-2 font-serif text-4xl font-semibold">{me.name}</h1>
            <h2 className="mt-1 text-lg font-medium leading-snug text-foreground/85">
              {me.role}
              <br />
              {me.company}
            </h2>
            <div className="mt-3 flex items-center gap-3 text-[13px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" /> {me.location}
              </span>
              <Linkedin className="h-4 w-4 text-primary" />
            </div>
            <p className="mt-4 max-w-[48ch] text-[15px] leading-relaxed text-muted-foreground">
              {me.bio}
            </p>
            <blockquote className="mt-5 border-l border-border pl-4">
              <p className="font-serif text-base leading-snug">"{me.quote}"</p>
              <p className="mt-2 text-[11px] text-muted-foreground">— {me.name}</p>
            </blockquote>
          </div>

          <div className="flex flex-col gap-2">
            {CONTROLS.map((c) => (
              <div
                key={c.k}
                className="flex items-center gap-3 rounded-md border border-border px-3 py-2.5"
              >
                <c.icon className="h-[17px] w-[17px] flex-none text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] text-muted-foreground">{c.k}</span>
                  <span className="block text-[12.5px] font-medium">{c.v}</span>
                </span>
              </div>
            ))}
            <Link
              to="/intros/preferences"
              className="mt-1.5 flex items-center justify-center gap-2 rounded-md bg-primary py-2.5 text-[13px] font-medium text-primary-foreground hover:opacity-90 transition"
            >
              Edit profile &amp; settings
            </Link>
            <button className="flex items-center justify-center gap-2 rounded-md border border-border py-2.5 text-[13px] hover:bg-white/5 transition">
              <Share2 className="h-[15px] w-[15px]" /> Share profile
            </button>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-1 border-b border-border/60 px-6 py-3">
        <span className="text-[11px] text-muted-foreground">People × Context × Opportunity</span>
      </div>

      <Page>
        <div className="grid gap-4 lg:grid-cols-4">
          <Panel title={`About ${me.name.split(" ")[0]}`} action="kebab">
            <p className="mb-3 text-[12.5px] leading-relaxed text-muted-foreground">{me.bio}</p>
            {me.credentials.map((c) => (
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
              {me.tags.map((f) => (
                <Tag key={f}>{f}</Tag>
              ))}
            </div>
          </Panel>

          <Panel title="Can help with" action="kebab">
            <div className="flex items-start gap-3">
              <Handshake className="mt-0.5 h-6 w-6 flex-none text-muted-foreground" />
              <ul className="list-none text-[12.5px] leading-relaxed text-muted-foreground">
                {me.helpWith.map((h) => (
                  <li key={h} className="py-0.5">
                    {h}
                  </li>
                ))}
              </ul>
            </div>
          </Panel>

          <Panel title="By the numbers">
            <StatLine stats={me.stats} />
          </Panel>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[2fr_1.3fr]">
          <Panel title="Currently looking for" action="kebab">
            <div className="flex items-start gap-3">
              <Search className="mt-0.5 h-6 w-6 flex-none text-muted-foreground" />
              <ul className="list-none text-[12.5px] leading-relaxed text-muted-foreground">
                {me.lookingFor.map((l) => (
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

        <div className="mt-4 flex items-start gap-2.5 rounded-md border border-border/70 p-4 text-[12.5px] text-muted-foreground">
          <Target className="mt-0.5 h-4 w-4 flex-none text-primary" />
          Want to see how this profile looks to other members?{" "}
          <Link to="/intros/preferences" className="text-primary hover:opacity-80 transition">
            Open preferences for a live preview
          </Link>
          .
        </div>
      </Page>
    </IntrosShell>
  );
}
