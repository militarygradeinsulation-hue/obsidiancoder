import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Calendar, Database, MapPin, Plus } from "lucide-react";
import { IntrosShell, Page } from "@/components/intros/shell";
import { Panel, Plate, Pill, Creed } from "@/components/intros/primitives";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/intros/preferences")({
  head: () => ({ meta: [{ title: "Aetheris Intros — Preferences" }] }),
  component: PreferencesPage,
});

const MEET = [
  "Founders",
  "Operators",
  "Investors",
  "LPs",
  "Strategic Partners",
  "Advisors",
  "Customers",
  "Talent",
  "Domain Experts",
  "Other",
];
const FOCUS = [
  "AI Infrastructure",
  "Enterprise Software",
  "Climate Tech",
  "Developer Tools",
  "Future of Work",
  "Global Markets",
];
const INDUSTRIES = [
  "AI / Machine Learning",
  "Infrastructure",
  "Fintech",
  "Climate & Sustainability",
  "Healthcare",
  "Consumer",
];
const GEOS = ["North America", "Europe", "Asia Pacific", "Latin America", "Middle East"];
const GOALS = [
  "Explore Investment Opportunities",
  "Find Strategic Partners",
  "Meet Potential Co-Founders",
  "Learn from Industry Experts",
  "Hire Key Talent",
  "Share Knowledge",
  "Other",
];
const CIRCLES = [
  "Horizon Capital Portfolio",
  "Stanford Network",
  "Climate Tech Leaders",
  "AI Builders",
  "Personal Board",
];

function ToggleRow({ label, defaultOn = false }: { label: string; defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <label className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-[12.5px] text-foreground/85">{label}</span>
      <Switch checked={on} onCheckedChange={setOn} />
    </label>
  );
}

function usePillGroup(initial: string[]) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initial));
  const toggle = (item: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });
  return [selected, toggle] as const;
}

function PreferencesPage() {
  const [theme, setTheme] = useState("Dark");
  const [circles, setCircles] = useState(["Horizon Capital Portfolio", "Stanford Network"]);

  const toggleCircle = (c: string) =>
    setCircles((x) => (x.includes(c) ? x.filter((y) => y !== c) : [...x, c]));

  const [meet, toggleMeet] = usePillGroup(MEET.slice(0, 4));
  const [focus, toggleFocus] = usePillGroup(FOCUS.slice(0, 3));
  const [industries, toggleIndustries] = usePillGroup(INDUSTRIES.slice(0, 1));
  const [geos, toggleGeos] = usePillGroup(GEOS.slice(0, 3));
  const [goals, toggleGoals] = usePillGroup(GOALS.slice(0, 1));

  return (
    <IntrosShell>
      <Page>
        <div className="grid gap-6 lg:grid-cols-[300px_1fr_320px]">
          {/* left rail */}
          <div>
            <Link
              to="/intros/profile"
              className="mb-5 inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition"
            >
              ← Back to profile
            </Link>
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Settings</p>
            <h1 className="mt-2 font-serif text-4xl font-semibold leading-tight">
              Preferences &amp;
              <br />
              <span className="text-primary">Customization</span>
            </h1>
            <h2 className="mt-4 text-lg font-medium leading-snug">
              Shape your experience.
              <br />
              Find better people.
              <br />
              Create more impact.
            </h2>
            <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
              Tailor how Aetheris works for you — from who you meet to how you're introduced. More
              context. Better connections. A smarter network, on your terms.
            </p>

            <div className="mt-6 grid grid-cols-3 gap-3 border-t border-border pt-4">
              <div>
                <div className="font-serif text-xl font-semibold">10K+</div>
                <div className="text-[11px] text-muted-foreground">Relationships</div>
              </div>
              <div>
                <div className="font-serif text-xl font-semibold">312</div>
                <div className="text-[11px] text-muted-foreground">Companies</div>
              </div>
              <div>
                <div className="font-serif text-xl font-semibold">28</div>
                <div className="text-[11px] text-muted-foreground">Countries</div>
              </div>
            </div>

            <blockquote className="mt-6 border-l border-border pl-4">
              <p className="font-serif text-[15px] leading-snug">
                "The right settings don't just filter noise — they create opportunity."
              </p>
              <p className="mt-2 text-[11px] text-muted-foreground">— Marcus Lee</p>
            </blockquote>

            <button className="mt-2 flex w-full items-center justify-center gap-2 rounded-md bg-primary py-2.5 text-[13px] font-medium text-primary-foreground hover:opacity-90 transition">
              Save changes <ArrowRight className="h-3.5 w-3.5" />
            </button>
            <Link
              to="/intros/profile"
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-border py-2.5 text-[13px] hover:bg-white/5 transition"
            >
              View my profile <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {/* panels */}
          <div>
            <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="font-serif text-2xl font-semibold">Customize your experience</h3>
                <p className="mt-1.5 max-w-[62ch] text-[13px] text-muted-foreground">
                  Set your preferences to get more relevant introductions, align with the right
                  people, and make the most of your network.
                </p>
              </div>
              <div className="glass-panel max-w-[260px] p-4">
                <p className="font-serif text-sm leading-snug">
                  "Better inputs. Brighter outcomes."
                </p>
                <p className="mt-2 text-[11px] text-muted-foreground">— Aetheris Intros</p>
              </div>
            </div>

            <div className="grid gap-3.5 lg:grid-cols-3">
              {/* column 1 */}
              <div className="flex flex-col gap-3.5">
                <Panel title="Intro preferences" action="kebab">
                  <p className="mb-3 text-[12px] leading-relaxed text-muted-foreground">
                    Shape the types of introductions you receive from our team and AI.
                  </p>
                  <p className="mb-2 text-[12px]">I'm most interested in meeting</p>
                  <div className="flex flex-wrap gap-1.5">
                    {MEET.map((m) => (
                      <Pill key={m} on={meet.has(m)} onClick={() => toggleMeet(m)}>
                        {m}
                      </Pill>
                    ))}
                  </div>
                </Panel>

                <Panel title="Focus areas" action="kebab">
                  <p className="mb-3 text-[12px] text-muted-foreground">
                    Select the topics and sectors you're focused on.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {FOCUS.map((f) => (
                      <Pill key={f} on={focus.has(f)} onClick={() => toggleFocus(f)}>
                        {f}
                      </Pill>
                    ))}
                    <button className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1 text-[11.5px] text-muted-foreground hover:text-foreground transition">
                      <Plus className="h-3 w-3" /> Add focus area
                    </button>
                  </div>
                </Panel>

                <Panel title="Target industries" action="kebab">
                  <p className="mb-3 text-[12px] text-muted-foreground">
                    Which industries are most relevant to you?
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {INDUSTRIES.map((f) => (
                      <Pill key={f} on={industries.has(f)} onClick={() => toggleIndustries(f)}>
                        {f}
                      </Pill>
                    ))}
                    <button className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1 text-[11.5px] text-muted-foreground hover:text-foreground transition">
                      <Plus className="h-3 w-3" /> Add industry
                    </button>
                  </div>
                </Panel>

                <Panel title="Target geographies" action="kebab">
                  <p className="mb-3 text-[12px] text-muted-foreground">
                    Where are you looking to make connections?
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {GEOS.map((f) => (
                      <Pill key={f} on={geos.has(f)} onClick={() => toggleGeos(f)}>
                        {f}
                      </Pill>
                    ))}
                    <button className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1 text-[11.5px] text-muted-foreground hover:text-foreground transition">
                      <Plus className="h-3 w-3" /> Add region
                    </button>
                  </div>
                </Panel>
              </div>

              {/* column 2 */}
              <div className="flex flex-col gap-3.5">
                <Panel title="Meeting preferences" action="kebab">
                  <p className="mb-1.5 text-[12px]">Preferred meeting length</p>
                  <select
                    className="h-9 w-full rounded-md border border-border bg-white/5 px-2.5 text-[13px]"
                    aria-label="Preferred meeting length"
                  >
                    <option>30 minutes</option>
                    <option>15 minutes</option>
                    <option>45 minutes</option>
                    <option>60 minutes</option>
                  </select>
                  <p className="mb-2 mt-4 text-[12px]">Calendar sync</p>
                  <div className="mb-3 flex items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-md border border-border">
                      <Calendar className="h-4 w-4" />
                    </span>
                    <span className="text-[12px] leading-snug text-muted-foreground">
                      Connect your calendar to share availability automatically.
                    </span>
                  </div>
                  <button className="w-full rounded-md bg-primary py-2 text-[13px] font-medium text-primary-foreground hover:opacity-90 transition">
                    Connect calendar
                  </button>
                </Panel>

                <Panel title="Relationship goals" action="kebab">
                  <p className="mb-3 text-[12px] text-muted-foreground">
                    What are you hoping to achieve through Aetheris?
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {GOALS.map((g) => (
                      <Pill key={g} on={goals.has(g)} onClick={() => toggleGoals(g)}>
                        {g}
                      </Pill>
                    ))}
                  </div>
                </Panel>

                <Panel title="Saved circles" action="kebab">
                  <p className="mb-3 text-[12px] text-muted-foreground">
                    Prioritize introductions within your trusted circles.
                  </p>
                  <select
                    className="mb-3 h-9 w-full rounded-md border border-border bg-white/5 px-2.5 text-[13px]"
                    aria-label="Circles"
                  >
                    <option>All saved circles</option>
                  </select>
                  {CIRCLES.map((c) => (
                    <label key={c} className="flex items-center gap-2 py-1 text-[12.5px]">
                      <input
                        type="checkbox"
                        checked={circles.includes(c)}
                        onChange={() => toggleCircle(c)}
                        className="h-3.5 w-3.5 accent-[var(--primary)]"
                      />
                      {c}
                    </label>
                  ))}
                </Panel>
              </div>

              {/* column 3 */}
              <div className="flex flex-col gap-3.5">
                <Panel title="AI recommendation settings" action="kebab">
                  <p className="mb-2.5 text-[12px] leading-relaxed text-muted-foreground">
                    Fine-tune how our AI identifies and suggests connections.
                  </p>
                  <ToggleRow label="Use AI for introduction recommendations" defaultOn />
                  <ToggleRow label="Prioritize mutual interests" defaultOn />
                  <ToggleRow label="Surface cross-industry opportunities" defaultOn />
                  <ToggleRow label="Include early-stage companies" />
                  <p className="mb-2 mt-3.5 text-[12px]">Relevance vs. serendipity</p>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    defaultValue={62}
                    className="w-full accent-[var(--primary)]"
                    aria-label="Relevance versus serendipity"
                  />
                  <div className="mt-1.5 flex justify-between text-[10.5px] text-muted-foreground">
                    <span>More relevant</span>
                    <span>More exploratory</span>
                  </div>
                </Panel>

                <Panel title="Who can contact you" action="kebab">
                  <p className="mb-2 text-[12px] text-muted-foreground">
                    Control who can request an introduction.
                  </p>
                  <select
                    className="mb-2.5 h-9 w-full rounded-md border border-border bg-white/5 px-2.5 text-[13px]"
                    aria-label="Who can contact you"
                  >
                    <option>People in my network</option>
                    <option>Anyone on Aetheris</option>
                    <option>Only people I request</option>
                  </select>
                  <ToggleRow label="Allow AI to suggest me to relevant people" defaultOn />
                </Panel>

                <Panel title="Communication permissions" action="kebab">
                  <ToggleRow label="Introduction requests" defaultOn />
                  <ToggleRow label="Follow-up messages" defaultOn />
                  <ToggleRow label="Event invitations" defaultOn />
                  <ToggleRow label="Product updates (curated)" />
                </Panel>

                <Panel title="Notification frequency" action="kebab">
                  <select
                    className="h-9 w-full rounded-md border border-border bg-white/5 px-2.5 text-[13px]"
                    aria-label="Notification frequency"
                  >
                    <option>Daily digest</option>
                    <option>Real time</option>
                    <option>Weekly summary</option>
                  </select>
                </Panel>

                <Panel title="Theme customization" action="kebab">
                  <p className="mb-2.5 text-[12px] text-muted-foreground">
                    Choose your preferred appearance.
                  </p>
                  <div className="flex gap-5">
                    {["Light", "Dark", "Auto"].map((t) => (
                      <label key={t} className="flex items-center gap-1.5 text-[12.5px]">
                        <input
                          type="radio"
                          name="theme"
                          checked={theme === t}
                          onChange={() => setTheme(t)}
                          className="accent-[var(--primary)]"
                        />
                        {t}
                      </label>
                    ))}
                  </div>
                </Panel>
              </div>
            </div>
          </div>

          {/* live preview */}
          <div className="flex flex-col gap-3.5">
            <Panel title="Live preview" action="kebab">
              <p className="mb-3 text-[12.5px] leading-relaxed text-muted-foreground">
                How your profile appears to others, based on your current settings.
              </p>
              <Plate className="relative mb-3 h-[190px]">
                <span className="absolute right-3 top-3 text-[10px] text-white">
                  Professional member
                </span>
              </Plate>
              <h3 className="font-serif text-2xl font-semibold">Marcus Lee</h3>
              <p className="mt-1.5 text-[15px] font-medium leading-snug">
                General Partner
                <br />
                Horizon Capital
              </p>
              <div className="mt-2 flex items-center gap-2 text-[12px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> New York, NY
                </span>
              </div>
              <p className="mt-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
                Investing in category-defining AI and infrastructure companies to build a more
                connected, human future.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Pill on>AI Infrastructure</Pill>
                <Pill on>Enterprise Software</Pill>
                <Pill on>Climate Tech</Pill>
                <Pill>+3</Pill>
              </div>
              <div className="my-3.5 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
                <div>
                  <div className="font-serif text-lg font-semibold">10+</div>
                  <div className="text-[10px] text-muted-foreground">Years in VC</div>
                </div>
                <div>
                  <div className="font-serif text-lg font-semibold">50+</div>
                  <div className="text-[10px] text-muted-foreground">Portfolio companies</div>
                </div>
                <div>
                  <div className="font-serif text-lg font-semibold">3x</div>
                  <div className="text-[10px] text-muted-foreground">Founder operator</div>
                </div>
              </div>
              <button className="flex w-full items-center justify-center gap-2 rounded-md bg-primary py-2 text-[13px] font-medium text-primary-foreground hover:opacity-90 transition">
                Request introduction <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </Panel>

            <div className="glass-panel p-4 text-right">
              <p className="font-serif text-base leading-snug">
                "Same people.
                <br />
                Bigger possibilities
                <br />— on your terms."
              </p>
              <p className="mt-3 text-[11px] text-muted-foreground">Aetheris Intros</p>
            </div>

            <Panel title="Profile visibility" action="kebab">
              <p className="mb-2 text-[12px] text-muted-foreground">
                Control how your profile appears on Aetheris.
              </p>
              <select
                className="h-9 w-full rounded-md border border-border bg-white/5 px-2.5 text-[13px]"
                aria-label="Profile visibility"
              >
                <option>Visible to all professional members</option>
                <option>Visible to my network</option>
                <option>Hidden</option>
              </select>
            </Panel>

            <Panel>
              <div className="flex items-start gap-3">
                <Database className="mt-0.5 h-[22px] w-[22px] flex-none text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <h3 className="mb-1.5 text-[13px] font-semibold">Memory controls</h3>
                  <p className="mb-3 text-[12.5px] leading-relaxed text-muted-foreground">
                    Manage what Aetheris remembers about you.
                  </p>
                  <Link
                    to="/intros/memory"
                    className="flex w-full items-center justify-center gap-2 rounded-md bg-primary py-2 text-[13px] font-medium text-primary-foreground hover:opacity-90 transition"
                  >
                    Manage memory &amp; data <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            </Panel>

            <Creed lines={["A smarter world is", "a more connected one."]} className="text-right" />
          </div>
        </div>
      </Page>
    </IntrosShell>
  );
}
