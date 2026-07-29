import React from "react";

export type AccordionItemData = {
  id: number | string;
  title: string;
  imageUrl: string;
};

const DEFAULT_ITEMS: AccordionItemData[] = [
  {
    id: 1,
    title: "Voice Assistant",
    imageUrl:
      "https://images.unsplash.com/photo-1628258334105-2a0b3d6efee1?q=80&w=1974&auto=format&fit=crop",
  },
  {
    id: 2,
    title: "AI Image Generation",
    imageUrl:
      "https://images.unsplash.com/photo-1677756119517-756a188d2d94?q=80&w=2070&auto=format&fit=crop",
  },
  {
    id: 3,
    title: "AI Chatbot + Local RAG",
    imageUrl:
      "https://images.unsplash.com/photo-1515879218367-8466d910aaa4?q=80&w=1974&auto=format&fit=crop",
  },
  {
    id: 4,
    title: "AI Agent",
    imageUrl:
      "https://images.unsplash.com/photo-1526628953301-3e589a6a8b74?q=80&w=2090&auto=format&fit=crop",
  },
  {
    id: 5,
    title: "Visual Understanding",
    imageUrl:
      "https://images.unsplash.com/photo-1554415707-6e8cfc93fe23?q=80&w=2070&auto=format&fit=crop",
  },
];

function AccordionItem({
  item,
  isActive,
  onActivate,
}: {
  item: AccordionItemData;
  isActive: boolean;
  onActivate: () => void;
}) {
  return (
    <button
      type="button"
      onMouseEnter={onActivate}
      onFocus={onActivate}
      onClick={onActivate}
      aria-pressed={isActive}
      className={`relative h-[280px] shrink-0 overflow-hidden rounded-2xl border border-white/10 text-left transition-[flex-grow,box-shadow] duration-500 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A125]/70 sm:h-[380px] ${
        isActive ? "flex-[3] shadow-[0_20px_60px_-30px_rgba(244,161,37,0.55)]" : "flex-[0.6]"
      }`}
    >
      <img
        src={item.imageUrl}
        alt={item.title}
        loading="lazy"
        onError={(e) => {
          const el = e.currentTarget;
          el.onerror = null;
          el.src = "https://placehold.co/400x450/111317/E8E6E1?text=Obsidian";
        }}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <span className="absolute inset-0 bg-gradient-to-t from-[#08090b] via-[#08090b]/40 to-transparent" />
      <span
        className={`absolute bottom-4 left-4 right-4 text-sm font-semibold tracking-tight text-[#E8E6E1] transition-opacity duration-300 ${
          isActive ? "opacity-100" : "opacity-0 sm:opacity-70"
        }`}
      >
        {item.title}
      </span>
    </button>
  );
}

export function LandingAccordionItem({
  items = DEFAULT_ITEMS,
  eyebrow,
  heading = "Accelerate Gen-AI Tasks on Any Device",
  body = "Build high-performance AI apps on-device without the hassle of model compression or edge deployment.",
  ctaLabel = "Contact Us",
  onCta,
}: {
  items?: AccordionItemData[];
  eyebrow?: string;
  heading?: string;
  body?: string;
  ctaLabel?: string;
  onCta?: () => void;
}) {
  const [activeIndex, setActiveIndex] = React.useState(items.length - 1);

  return (
    <div className="grid items-center gap-8 lg:grid-cols-2">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-[10px] uppercase tracking-[0.28em] text-[#F4A125]">{eyebrow}</p>
        ) : null}
        <h2 className="mt-2 text-3xl font-semibold leading-tight tracking-tight text-[#E8E6E1] sm:text-4xl">
          {heading}
        </h2>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-[#B6BCC8]">{body}</p>
        {onCta ? (
          <button
            type="button"
            onClick={onCta}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-b from-[#F4A125] to-[#DD9324] px-5 py-2.5 text-sm font-semibold text-[#111317] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A125]/70"
          >
            {ctaLabel}
          </button>
        ) : null}
      </div>

      <div className="flex min-w-0 gap-2 overflow-x-auto pb-1">
        {items.map((item, index) => (
          <AccordionItem
            key={item.id}
            item={item}
            isActive={index === activeIndex}
            onActivate={() => setActiveIndex(index)}
          />
        ))}
      </div>
    </div>
  );
}

export default LandingAccordionItem;
