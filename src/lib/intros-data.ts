/* Mock data for the Aetheris Intros section. Swap these arrays for Supabase
   queries later — component props are shaped to match these exports, so
   nothing else needs to change. */

export const me = { name: "Daniel Kim", meta: "Member since 2024" };

export const people = [
  {
    id: "sarah-chen",
    name: "Sarah Chen",
    role: "Founder & CEO",
    company: "Vercelity",
    location: "San Francisco, CA",
    note: "Scaling AI infrastructure for the real economy.",
    tags: ["AI", "Infrastructure"],
    fit: 98,
    fitLabel: "Excellent fit",
    mutuals: 12,
  },
  {
    id: "daniel-kim",
    name: "Daniel Kim",
    role: "CTO",
    company: "Nexus Systems",
    location: "Seattle, WA",
    note: "Building enterprise software for critical industries.",
    tags: ["Enterprise", "Cloud"],
    fit: 94,
    fitLabel: "Strong fit",
    mutuals: 8,
  },
  {
    id: "maya-patel",
    name: "Maya Patel",
    role: "Investor",
    company: "Tide Capital",
    location: "New York, NY",
    note: "Backing exceptional founders at seed and Series A.",
    tags: ["Venture Capital", "Fintech"],
    fit: 92,
    fitLabel: "Strong fit",
    mutuals: 15,
  },
  {
    id: "alex-monroe",
    name: "Alex Monroe",
    role: "Strategic Advisor",
    company: "Independent",
    location: "Dubai, UAE",
    note: "Advising global companies on AI strategy and markets.",
    tags: ["Strategy", "Global"],
    fit: 88,
    fitLabel: "Great fit",
    mutuals: 11,
  },
  {
    id: "lisa-tran",
    name: "Lisa Tran",
    role: "VP Product",
    company: "Atlas Cloud",
    location: "Singapore",
    note: "Building developer tools for the next generation.",
    tags: ["Product", "Infrastructure"],
    fit: 85,
    fitLabel: "Great fit",
    mutuals: 7,
  },
  {
    id: "carlos-mendes",
    name: "Carlos Mendes",
    role: "Founder & CEO",
    company: "Lumen AI",
    location: "Berlin, Germany",
    note: "Applying AI to climate and industrial transformation.",
    tags: ["Climate Tech", "B2B"],
    fit: 82,
    fitLabel: "Great fit",
    mutuals: 9,
  },
  {
    id: "nina-park",
    name: "Nina Park",
    role: "Partner",
    company: "Summit Growth",
    location: "Seoul, South Korea",
    note: "Growth investor focused on marketplaces and vertical software.",
    tags: ["Growth", "Marketplaces"],
    fit: 78,
    fitLabel: "Good fit",
    mutuals: 6,
  },
  {
    id: "marcus-thompson",
    name: "Marcus Thompson",
    role: "COO",
    company: "Helix Health",
    location: "Boston, MA",
    note: "Scaling healthcare infrastructure for broader access.",
    tags: ["Healthcare", "Operations"],
    fit: 76,
    fitLabel: "Good fit",
    mutuals: 4,
  },
] as const;

export const connectors = [
  {
    name: "Marcus Lee",
    role: "General Partner",
    company: "Horizon Ventures",
    focus: "Venture Capital",
  },
  {
    name: "Priya Desai",
    role: "Operating Advisor",
    company: "Aurora Ventures",
    focus: "AI & Enterprise",
  },
  { name: "James Okafor", role: "Founder & CEO", company: "Forge AI", focus: "Deep Tech" },
  {
    name: "Elena Rossi",
    role: "Operating Partner",
    company: "Vector Partners",
    focus: "Infrastructure",
  },
] as const;

export type Thread = {
  id: number;
  name: string;
  preview: string;
  time: string;
  unread: boolean;
  badge?: string;
  live?: boolean;
};

export const threads: Thread[] = [
  {
    id: 1,
    name: "Sarah Chen",
    preview: "Glad to connect, Marcus. We're …",
    time: "10:26 AM",
    badge: "Introduction",
    unread: false,
    live: true,
  },
  {
    id: 2,
    name: "Marcus Lee",
    preview: "Perfect. Looking forward to it.",
    time: "10:45 AM",
    unread: true,
  },
  {
    id: 3,
    name: "Elena Rossi",
    preview: "Thanks for the introduction. …",
    time: "Yesterday",
    badge: "Introduction",
    unread: true,
  },
  {
    id: 4,
    name: "James Okafor",
    preview: "Looking forward to connecting …",
    time: "Mar 12",
    unread: false,
  },
  {
    id: 5,
    name: "Alex Monroe",
    preview: "Appreciate the context. …",
    time: "Mar 11",
    unread: false,
  },
  {
    id: 6,
    name: "Priya Desai",
    preview: "This could be a great fit. …",
    time: "Mar 10",
    unread: false,
  },
  {
    id: 7,
    name: "David Park",
    preview: "Let's find time next week. …",
    time: "Mar 8",
    unread: false,
  },
];

export const conversation = [
  {
    from: "them",
    who: "Sarah Chen",
    time: "10:14 AM",
    text: "Thanks for the introduction, Marcus. I've been following Aetheris Intros and am impressed with your focus on real-world infrastructure use cases. We're currently exploring strategic partners to expand our enterprise reach, and your perspective would be valuable.",
  },
  {
    from: "me",
    who: "Marcus Lee",
    time: "10:26 AM",
    text: "Glad to connect, Sarah. We're focused on making AI infrastructure more accessible to enterprises, and I think there's strong alignment with the types of companies you back.",
  },
  {
    from: "them",
    who: "Sarah Chen",
    time: "10:38 AM",
    text: "Agreed. We're particularly interested in teams building at the intersection of applied AI and operational infrastructure. Would you be open to a short call next week to explore potential synergies?",
  },
  {
    from: "me",
    who: "Marcus Lee",
    time: "10:45 AM",
    text: "Absolutely. I'm free Tuesday or Wednesday next week. I'll send a few time options, and can also share a brief deck in advance.",
  },
] as const;

export const introRequests = [
  { from: "Elena Rossi", role: "CTO, Nebula Cloud", target: "James Okafor", date: "Mar 12, 2024" },
  { from: "Daniel Chen", role: "CTO, Nexus Systems", target: "Alex Monroe", date: "Mar 11, 2024" },
  {
    from: "Priya Desai",
    role: "Principal, Aurora Ventures",
    target: "Marcus Lee",
    date: "Mar 10, 2024",
  },
] as const;

export const rememberedConversations = [
  {
    name: "Sarah Chen",
    role: "Founder & CEO, Vernality",
    summary:
      "Discussed their Series B plans, hiring a Head of Product, and interest in climate tech partners.",
    date: "Apr 16, 2025",
    quote: "We're looking for design partners who understand regulated markets…",
    topics: ["Fundraising", "Hiring", "Climate Tech"],
  },
  {
    name: "James Okafor",
    role: "Partner, Horizon Ventures",
    summary:
      "Talked about AI infrastructure trends, potential co-investment opportunities, and meeting at VC Summit.",
    date: "Apr 10, 2025",
    quote: "Let's revisit this after your product launch in Q3.",
    topics: ["AI Infrastructure", "Investing", "Partnership"],
  },
  {
    name: "Elena Rossi",
    role: "Operating Partner, Velora Ventures",
    summary:
      "Shared perspective on European market expansion and introduced a potential portfolio company.",
    date: "Mar 12, 2025",
    quote: "I'll make the introduction to my colleague in Berlin.",
    topics: ["Market Expansion", "Europe", "Introductions"],
  },
  {
    name: "Priya Desai",
    role: "Investor, ArcGrid",
    summary:
      "Discussed clean energy opportunities, mentioned their interest in meeting their LP network.",
    date: "Mar 12, 2025",
    quote: "Would love to connect you with our LPs who are focused on this space.",
    topics: ["Clean Energy", "LP Network", "Introduction"],
  },
  {
    name: "Alex Morales",
    role: "CEO, Stratos",
    summary:
      "Caught up on team growth, product launch, and potential speaking opportunity at Climate Summit.",
    date: "Feb 25, 2025",
    quote: "Let's explore a panel together later this year.",
    topics: ["Team Growth", "Speaking", "Climate"],
  },
] as const;

export const peopleInMemory = [
  { name: "Sarah Chen", role: "Founder, Vernality", score: 95 },
  { name: "James Okafor", role: "Partner, Horizon Ventures", score: 88 },
  { name: "Elena Rossi", role: "Operating Partner, Velora", score: 94 },
  { name: "Priya Desai", role: "Investor, ArcGrid", score: 91 },
  { name: "Alex Morales", role: "CEO, Stratos", score: 87 },
] as const;

export const learned = [
  {
    name: "Sarah Chen",
    text: "is exploring a Series B infrastructure round for Atelier.",
    confidence: 92,
    privacy: "Private",
    scope: "Only you",
    ago: "2h ago",
    src: "Conversation",
  },
  {
    name: "James Okafor",
    text: "is hiring a Head of Partnerships in Q3.",
    confidence: 88,
    privacy: "Shared",
    scope: "With your team",
    ago: "5h ago",
    src: "Email",
  },
  {
    name: "Elena Rossi",
    text: "is interested in climate tech introductions in Latin America.",
    confidence: 94,
    privacy: "Private",
    scope: "Only you",
    ago: "1d ago",
    src: "Meeting",
  },
  {
    name: "Daniel Kim",
    text: "plans to expand to Singapore next year.",
    confidence: 87,
    privacy: "Shared",
    scope: "With your team",
    ago: "1d ago",
    src: "Conversation",
  },
  {
    name: "Priya Desai",
    text: "is looking for design partners for a new consumer brand.",
    confidence: 91,
    privacy: "Private",
    scope: "Only you",
    ago: "2d ago",
    src: "Message",
  },
] as const;

export const newlyLearnedNeeds = [
  { text: "3 people need design partners in the next 3 months." },
  { text: "2 founders are exploring Series A or B funding." },
  { text: "4 people are looking for introductions in Europe." },
] as const;

export const reconnect = [
  {
    name: "Alex Morales",
    last: "Last conversation 4 months ago",
    note: "Discuss product launch progress.",
  },
  {
    name: "Daniel Kim",
    last: "Last conversation 3 months ago",
    note: "Follow up on potential partnership.",
  },
  {
    name: "Lena Park",
    last: "Last conversation 6 weeks ago",
    note: "Conversation about hiring paused.",
  },
] as const;

export const cooling = [
  { name: "Marcus Lee", last: "Last message 2 months ago", note: "AI infrastructure discussion." },
  { name: "Nina Patel", last: "Last message 2 months ago", note: "Partnership opportunity." },
  { name: "Omar El-Sayed", last: "Last message 3 months ago", note: "Check on expansion plans." },
] as const;

export const contextualConnections = [
  { name: "David Park", role: "Partner, GreenEdge", score: 93 },
  { name: "Lena Torres", role: "Head of Sustainability, Microsoft", score: 89 },
  { name: "Ravi Menon", role: "Investor, EarthFund", score: 87 },
] as const;

export const relationshipPatterns = [
  { text: "You often connect founders in climate, AI and infrastructure." },
  { text: "19 successful introductions in the last 6 months." },
  { text: "Your strongest relationships lead to investment opportunities." },
] as const;

export const posts = [
  {
    name: "Sarah Chen",
    role: "Founder & CEO, Vercelity",
    time: "2h ago",
    body: "We just closed our Series B to expand AI infrastructure for creative work.\nGrateful to an incredible group of operators and investors who believe in a more open, human-centered future for AI.",
    card: {
      title: "From idea to global scale.",
      note: "Thank you to everyone who's been part of the journey.",
      sub: "Building a more open creative economy.",
    },
    likes: 246,
    comments: 32,
    shares: 18,
    mutuals: 12,
  },
  {
    name: "Marcus Lee",
    role: "General Partner, Horizon Capital",
    time: "4h ago",
    body: "Looking to meet innovative founders working on climate adaptation, especially in Asia. Would love to hear what you're building and explore how we can help.",
    likes: 118,
    comments: 24,
    shares: 9,
    mutuals: 7,
  },
  {
    name: "Elena Rossi",
    role: "Operating Partner, Voltera Partners",
    time: "Yesterday",
    body: "Five signals I watch before backing an industrial-tech team: a real customer in production, a cost curve that bends, a permitting path, an operator on the founding team, and honest unit economics.",
    likes: 431,
    comments: 57,
    shares: 44,
    mutuals: 19,
  },
] as const;

export const events = [
  { m: "Apr", d: "02", title: "Climate Infrastructure Roundtable", place: "London · Invite only" },
  { m: "Apr", d: "21", title: "AI in Physical Systems Summit", place: "San Francisco" },
  { m: "May", d: "09", title: "Aetheris Members Dinner", place: "New York · 12 seats" },
] as const;

export const locations = [
  { city: "San Francisco", n: 248 },
  { city: "New York", n: 196 },
  { city: "London", n: 142 },
  { city: "Singapore", n: 98 },
  { city: "Berlin", n: 76 },
] as const;

export const industries = [
  { city: "AI & Infrastructure", n: 264 },
  { city: "Climate & Energy", n: 181 },
  { city: "Enterprise Software", n: 155 },
  { city: "Healthcare", n: 87 },
  { city: "Fintech", n: 64 },
] as const;

export const roles = [
  { city: "Founders", n: 402 },
  { city: "Investors", n: 288 },
  { city: "Operators", n: 211 },
  { city: "Advisors", n: 132 },
  { city: "Executives", n: 118 },
] as const;

export const joinedThisWeek = [
  { name: "Rachel Kim", role: "CEO, Solis Energy" },
  { name: "Omar El-Sayed", role: "Partner, Crescent Capital" },
  { name: "Natalie Brooks", role: "Chief Product Officer, ArcGrid" },
] as const;

export const elena = {
  name: "Elena Rossi",
  first: "Elena",
  last: "Rossi",
  role: "Operating Partner",
  company: "Voltera Partners",
  location: "London, UK",
  summary: "Connecting exceptional people and capital to scale climate and industrial innovation.",
  quote:
    "The biggest challenges of our time are also the greatest opportunities — when the right people are connected.",
  about:
    "Elena Rossi is an Operating Partner at Voltera Partners, a global venture capital firm backing category-defining companies at the intersection of climate, infrastructure, and advanced technology. She partners closely with founders from Series A through scale, bringing a rare combination of operating experience, capital, and a deep network to help build enduring companies.",
  credentials: [
    "Voltera Partners",
    "Stanford GSB (MBA)",
    "UC Berkeley (BS, Environmental Engineering)",
  ],
  focus: [
    "Climate Tech",
    "Clean Infrastructure",
    "Frontier AI",
    "Energy Transition",
    "Industrial Transformation",
    "Founder Support",
  ],
  goals: [
    "Meet exceptional founders (Seed – Series B)",
    "Explore co-investment with aligned partners",
    "Support talent and operator development",
    "Learn from global markets and local innovators",
  ],
  helpWith: [
    "Fundraising strategy and investor access",
    "Go-to-market and scaling operations",
    "Strategic partnerships (corporate & government)",
    "Board support and talent recruitment",
    "Introductions to global network (US, Europe, Asia)",
  ],
  lookingFor: [
    "High-conviction founders in climate and industrial tech",
    "Introductions to domain experts and operators",
    "Insights on emerging markets (APAC, LatAm)",
    "Co-investors for upcoming opportunities",
  ],
  compatibility: [
    {
      value: 92,
      label: "Strategic Alignment",
      note: "Shared focus on climate and industrial tech.",
    },
    { value: 86, label: "Shared Interests", note: "Aligned on markets, themes, and impact." },
    { value: 78, label: "Network Value", note: "High complementary connections." },
  ],
  readouts: [
    { k: "3", v: "Mutual Connections" },
    { k: "High", v: "Conversation Potential" },
    { k: "Aligned", v: "On Long-Term Impact" },
    { k: "Strong", v: "Complementary Expertise" },
  ],
  sharedConnections: [
    { name: "Marcus Lee", role: "General Partner, Horizon Capital", degree: "1st" },
    { name: "Priya Desai", role: "Principal, Aurora Ventures", degree: "1st" },
    { name: "James Okafor", role: "Founder & CEO, Forge AI", degree: "2nd" },
  ],
  history: [
    { t: "You both attended Tech for Climate Summit", d: "Apr 2024" },
    { t: "Introduced by Sarah Chen", d: "Jan 2024" },
    { t: "You both engaged in AI Infrastructure group", d: "Oct 2023" },
    { t: "Elena viewed your profile", d: "3 days ago" },
  ],
  activity: [
    {
      kind: "Shared an article",
      title: "Why Climate Infrastructure Is the Next Great Buildout",
      time: "2d ago",
      likes: "1.2K",
      comments: 87,
      shares: 12,
    },
    {
      kind: "Commented",
      title: "“Incredible founders are solving real problems, not just chasing hype.”",
      time: "5d ago",
      likes: 243,
      comments: 18,
    },
  ],
  insights: [
    {
      kind: "Insight",
      title: "Five Signals for the Next Wave in Climate Infrastructure",
      date: "Feb 2, 2024",
    },
    {
      kind: "Perspective",
      title: "How Industrial AI Can Unlock a More Resilient Economy",
      date: "Jan 18, 2024",
    },
  ],
} as const;
