import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  Heart,
  MessageCircle,
  Share2,
  Link2,
  Users,
  Sparkles,
  MoreHorizontal,
  Mail,
} from "lucide-react";
import { IntrosShell, Page } from "@/components/intros/shell";
import { InitialsAvatar, Panel, Plate } from "@/components/intros/primitives";
import { posts, events, people, me } from "@/lib/intros-data";

export const Route = createFileRoute("/intros/")({
  head: () => ({
    meta: [{ title: "Aetheris Intros — Home" }],
  }),
  component: IntrosHome,
});

const TABS = ["For you", "Network", "Following", "Opportunities"] as const;

function IntrosHome() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("For you");
  const [text, setText] = useState("");

  const shownPosts =
    tab === "For you" ? posts : posts.filter((p) => (p.feed as readonly string[]).includes(tab));

  return (
    <IntrosShell>
      <Page>
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="flex flex-col gap-4">
            {/* composer */}
            <Panel>
              <div className="flex items-start gap-3.5">
                <InitialsAvatar name={me.name} size={44} />
                <div className="flex-1">
                  <textarea
                    className="h-20 w-full resize-none rounded-md border border-border bg-white/5 p-3 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary/50"
                    placeholder={
                      "What do you need right now?\nAsk, share, or start a conversation..."
                    }
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    aria-label="Write a post"
                  />
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex gap-5 text-[12.5px] text-muted-foreground">
                      <button className="flex items-center gap-1.5 hover:text-foreground transition">
                        <Sparkles className="h-4 w-4" /> Add context
                      </button>
                      <button className="flex items-center gap-1.5 hover:text-foreground transition">
                        <Users className="h-4 w-4" /> Tag people
                      </button>
                      <button className="flex items-center gap-1.5 hover:text-foreground transition">
                        <Link2 className="h-4 w-4" /> Add link
                      </button>
                    </div>
                    <button className="rounded-full bg-primary px-6 py-1.5 text-[13px] font-medium text-primary-foreground hover:opacity-90 transition">
                      Post
                    </button>
                  </div>
                </div>
              </div>
              <div className="glass-panel mt-3 p-3">
                <div className="mb-1.5 flex items-center gap-2 text-[12.5px] font-semibold text-primary">
                  <Sparkles className="h-4 w-4" /> Get better responses
                </div>
                <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                  Add context about your goals and Aetheris will suggest relevant people.
                </p>
              </div>
            </Panel>

            {/* feed */}
            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex flex-1 gap-1 overflow-x-auto">
                  {TABS.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={`whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] transition ${
                        tab === t
                          ? "bg-white/8 text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <select
                  className="h-9 w-44 rounded-md border border-border bg-white/5 px-2.5 text-xs"
                  aria-label="Sort feed"
                >
                  <option>Sort: Most relevant</option>
                  <option>Sort: Most recent</option>
                </select>
              </div>

              <div className="flex flex-col gap-3">
                {shownPosts.map((p) => (
                  <article key={p.name + p.time} className="glass-panel p-4">
                    <div className="flex items-start gap-3.5">
                      <InitialsAvatar name={p.name} size={46} square />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[14px] font-semibold">{p.name}</span>
                            <span className="text-[12.5px] text-muted-foreground">{p.role}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-muted-foreground/70">{p.time}</span>
                            <button
                              aria-label="More"
                              className="text-muted-foreground hover:text-foreground transition"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        <p className="mt-2 whitespace-pre-line text-[13.5px] leading-relaxed text-foreground/85">
                          {p.body}
                        </p>

                        {"card" in p && p.card && (
                          <div className="mt-3 flex gap-3 rounded-md border border-border/70 p-3">
                            <Plate className="h-20 w-28 flex-none" />
                            <div>
                              <div className="text-[13.5px] font-semibold">{p.card.title}</div>
                              <p className="mt-1.5 text-[12.5px] text-muted-foreground">
                                {p.card.note}
                              </p>
                              <p className="mt-1.5 text-[11px] text-muted-foreground/70">
                                {p.card.sub}
                              </p>
                            </div>
                          </div>
                        )}

                        <div className="mt-3 flex items-center gap-5 text-[12.5px] text-muted-foreground">
                          <button className="flex items-center gap-1.5 hover:text-foreground transition">
                            <Heart className="h-[15px] w-[15px]" /> {p.likes}
                          </button>
                          <button className="flex items-center gap-1.5 hover:text-foreground transition">
                            <MessageCircle className="h-[15px] w-[15px]" /> {p.comments}
                          </button>
                          <button className="flex items-center gap-1.5 hover:text-foreground transition">
                            <Share2 className="h-[15px] w-[15px]" /> {p.shares}
                          </button>
                          <span className="ml-auto text-[11px]">
                            {p.mutuals} mutual connections
                          </span>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
                {shownPosts.length === 0 && (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    Nothing in {tab} yet.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* rail */}
          <div className="flex flex-col gap-4">
            <Panel>
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className="h-[17px] w-[17px] text-primary" />
                <span className="flex-1 text-[13px] font-semibold">
                  AI introduction recommendation
                </span>
                <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                  Beta
                </span>
              </div>
              <h3 className="font-serif text-lg leading-snug">
                Strong mutual interests. High potential value.
              </h3>
              <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
                Elena and you both care about climate tech, next-gen infrastructure, and supporting
                exceptional founders at the Series A–B stage. She's also connected to 3 people in
                your network.
              </p>
              <div className="mt-3 flex gap-2.5 rounded-md border border-border/70 p-3">
                <Sparkles className="h-[17px] w-[17px] flex-none text-primary" />
                <div>
                  <h4 className="text-[12px] font-semibold">Why now</h4>
                  <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                    Elena is actively meeting founders exploring climate infrastructure and has
                    shown increased interest in AI for physical systems this quarter.
                  </p>
                </div>
              </div>
              <div className="mt-3.5 flex gap-2">
                <Link
                  to="/intros/requests"
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-[13px] font-medium text-primary-foreground hover:opacity-90 transition"
                >
                  <Mail className="h-[15px] w-[15px]" /> Request introduction
                </Link>
                <button className="rounded-md border border-border px-3 py-2 text-[13px] hover:bg-white/5 transition">
                  View reasoning
                </button>
              </div>
            </Panel>

            <Panel title="Upcoming" action="View all">
              {events.map((e) => (
                <div
                  key={e.title}
                  className="flex items-center gap-3 border-b border-border/60 py-2.5 last:border-0"
                >
                  <div className="flex w-11 flex-none flex-col items-center rounded-md border border-border py-1.5">
                    <div className="text-[9.5px] uppercase text-muted-foreground">{e.m}</div>
                    <div className="font-serif text-sm font-semibold">{e.d}</div>
                  </div>
                  <div>
                    <div className="text-[12.5px] leading-tight">{e.title}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">{e.place}</div>
                  </div>
                </div>
              ))}
            </Panel>

            <Panel title="People to meet" action="View all" onAction={() => {}}>
              {people.slice(0, 4).map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 border-b border-border/60 py-2.5 last:border-0"
                >
                  <InitialsAvatar name={p.name} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className="truncate text-[12.5px] font-medium">{p.name}</span>
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {p.role}, {p.company}
                    </div>
                  </div>
                  <button className="flex-none rounded-full border border-border px-3 py-1 text-[11px] hover:bg-white/5 transition">
                    Connect
                  </button>
                </div>
              ))}
            </Panel>
          </div>
        </div>
      </Page>
    </IntrosShell>
  );
}
