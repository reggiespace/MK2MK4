/**
 * The algorithm research brief, as data.
 *
 * This is the grounding document the whole template system was designed
 * against — the manifests' slot budgets, the safe zones, the CTA convention
 * and the generation prompts all trace back to a rule here. Keeping it as
 * structured data (rather than prose in a component) means the numbers that
 * constrain the templates live in one readable place.
 *
 * Compiled July 2026 from secondary analyses and platform-statement round-ups.
 * Load-bearing figures were cross-checked across independent sources; where
 * guides disagreed, the more recent and more conservative figure was taken.
 * Platform behaviour changes — re-check before treating any figure as current.
 */

export interface Signal {
  label: string;
  note: string;
  /** Relative weighting, not a published percentage. Order is the point. */
  weight: number;
  tone: "accent" | "secondary" | "muted";
}

export const SIGNALS: Signal[] = [
  { label: "Sends / DM shares", note: "strongest", weight: 100, tone: "accent" },
  { label: "Watch time / completion", note: "gates video", weight: 90, tone: "secondary" },
  { label: "Saves", note: "high intent", weight: 82, tone: "accent" },
  { label: "Comments (depth)", note: "moderate", weight: 55, tone: "secondary" },
  { label: "Likes", note: "weakest reported", weight: 28, tone: "muted" },
];

export interface Surface {
  mark: string;
  name: string;
  question: string;
  signal: string;
}

export const SURFACES: Surface[] = [
  {
    mark: "F",
    name: "Feed & Carousel",
    question: "Would this person care?",
    signal: "Saves, sends and — rising fast — profile-visit rate. Relationship plus high-intent actions.",
  },
  {
    mark: "R",
    name: "Reels",
    question: "Would they watch it all the way through?",
    signal: "Watch time first; sends per reach for new audiences. Retention is everything.",
  },
  {
    mark: "S",
    name: "Stories",
    question: "Do these two people actually talk?",
    signal: "Viewing history and replies. A relationship signal, not a discovery channel.",
  },
  {
    mark: "E",
    name: "Explore",
    question: "Is this good enough for a stranger?",
    signal: "Early engagement velocity and interest-match; follower count barely matters.",
  },
];

export interface FormatBrief {
  id: string;
  index: string;
  title: string;
  paragraphs: string[];
  stats: { value: string; caption: string }[];
  rules: { title: string; body: string }[];
}

export const FORMATS: FormatBrief[] = [
  {
    id: "reels",
    index: "01",
    title: "Reels — retention is the toll booth",
    paragraphs: [
      "Watch time is the number-one ranking factor for Reels across both connected reach (your followers) and unconnected reach (recommendations). The model reads both relative watch time (percent viewed) and absolute seconds — which is why a 14-second Reel watched twice often beats a 60-second Reel watched once.",
      "The gate is the opening. The decision to keep watching is reflexive: viewers commit in under two seconds, and if they drop before the three-second mark distribution is throttled. That makes the first frame a design problem, not just a scripting one. For reaching non-followers, sends per reach then does the heavy lifting.",
      "Two hygiene rules gate eligibility: keep it original (no imported watermarks — recycled-looking video is deprioritised, and original content earns 40–60% more distribution) and keep it short. Reels up to three minutes can reach non-followers, but 30–90 seconds consistently performs better.",
    ],
    stats: [
      { value: "3 sec", caption: "to survive the first retention check — or distribution is cut." },
      { value: "3–5×", caption: "the reach value of a DM send versus a like, for new audiences." },
    ],
    rules: [
      { title: "Hook band", body: "Hook text sits between y=200–600px so it reads before the caption bar loads." },
      { title: "Clear the chrome", body: "The app overlays the bottom 400–480px and right 90–120px. Keep everything inside a centered ≈900×1440 box." },
      { title: "Type that survives", body: "On-screen type at 45–60px minimum, weight 700+, with a dark stroke over imagery." },
      { title: "Ten words", body: "No more than ten words per on-screen block." },
    ],
  },
  {
    id: "carousels",
    index: "02",
    title: "Carousels — the format the algorithm re-serves",
    paragraphs: [
      "Carousels carry the highest engagement rate of any format and out-reach single images by roughly 1.9–3×, largely because of one mechanic: when a viewer doesn't swipe, Instagram often gives the post a second chance and re-serves it led by the second slide, 24–48 hours later. More slides create more re-engagement windows; the format supports up to 20.",
      "The cover is the single most important design asset in the system — the only slide the feed shows before any engagement. It must stop the scroll, name its audience, and open a curiosity gap in one glance: a 5–8 word hook as the largest element, a high-contrast pattern interrupt, and a promise that can't be resolved without swiping.",
      "Because of the re-serve, treat slide 2 as an independent second hook, and place the most striking point by slide 3 — most viewers never reach slide 7. Design the final slide to be saved and returned to: a checklist, summary, or one high-value statement that delivers even if it's the only slide someone keeps.",
    ],
    stats: [
      { value: "3–5×", caption: "more non-follower reach when 70%+ of viewers swipe through." },
      { value: "slide 2", caption: "is a second cover — the post is re-served led by it if you don't swipe." },
    ],
    rules: [
      { title: "Frame at 4:5", body: "1080×1350 takes maximum feed height; keep key content inside a 1000×1270 center." },
      { title: "Three colors, 60-30-10", body: "One display and one body face; body text at 4.5:1 contrast minimum." },
      { title: "One idea per slide", body: "5–8 slides is the working band, with visual consistency across all of them." },
      { title: "Specific beats generic", body: "“5 shifts that saved me 10 hrs/week” over “productivity tips.”" },
    ],
  },
  {
    id: "stories",
    index: "03",
    title: "Stories — the relationship engine, not a reach engine",
    paragraphs: [
      "Stories are not the tool for reaching new people. They deepen the relationship with existing followers — and those relationship signals are exactly what lift Feed and Reels ranking for those followers. So Story templates optimise for a tap, a vote, a reply, never a swipe-away.",
    ],
    stats: [],
    rules: [
      {
        title: "Build a sticker in",
        body: "Interactive stickers — polls, questions, quizzes, emoji sliders — are the most effective Stories engagement tool, and replies score as one of the strongest relationship signals. Put a sticker on the first frame.",
      },
      {
        title: "Poll first, then question",
        body: "The poll collects the most taps for the least viewer effort. A question sticker on a later frame opens a text-reply channel into DMs, which strengthens the signal further.",
      },
      {
        title: "Frame & cadence",
        body: "Keep content out of the top and bottom ~250px of the 1080×1920 frame. Post 1–3 Stories daily; tap-through tends to drop after the fifth frame.",
      },
    ],
  },
];

export interface Hook {
  name: string;
  example: string;
  /** The three most consistently viral formulas in 2026. */
  topTier?: boolean;
}

export const HOOKS: Hook[] = [
  { name: "Contrarian claim", example: "Everything you've been told about protein timing is backwards.", topTier: true },
  { name: "Mistake warning", example: "The one carousel mistake quietly killing your reach.", topTier: true },
  { name: "List tease", example: "5 shifts that saved me 10 hours a week (#3 surprised me).", topTier: true },
  { name: "Open question", example: "Why do some posts hit 200K while yours die at 2K?" },
  { name: "Callout", example: "Most people get this wrong about their fade days." },
  { name: "Reveal / POV", example: "Here's what nobody tells you about week three." },
];

/** The nine rules every template in this system is built to satisfy. */
export const MANDATE: string[] = [
  "One hook, largest element. Every cover and title frame carries a 5–8 word curiosity gap as the biggest text on the surface.",
  'Design to be saved and sent. Build a reference-worthy end slide and "send this to someone who…" moments into the layout, not the caption.',
  "Respect the 9:16 safe zone. Lock a centered ≈900×1440 content box; keep the bottom 480px and right 120px clear of anything that matters.",
  "Slide 2 is a second cover. Make it independently compelling — the re-serve mechanic may show it first.",
  "Front-load the payoff. Strongest point by slide 3; never bury it on slide 7.",
  "Type that survives thumbnails. Display face for hooks at heavy weight; body at or above platform-safe size at 4.5:1 contrast; dark stroke over imagery.",
  "Three colors, 60-30-10, one display plus one body pairing. Visual consistency across every slide of a set.",
  "Motion and voice ready. Reel frames assume on-screen text is the narration script over a generated background; a directional cue points to what is next.",
  "A sticker zone on Stories. Reserve a tap target for a poll or question on frame one — the template invites interaction by default.",
];

export interface Source {
  n: number;
  publisher: string;
  title: string;
  url: string;
}

export const SOURCES: Source[] = [
  { n: 1, publisher: "Later", title: "Instagram algorithm in 2026: rank signals for growth", url: "https://later.com/blog/how-instagram-algorithm-works/" },
  { n: 2, publisher: "Clixie", title: "Instagram algorithm 2026: the 4 ranking signals that matter", url: "https://www.clixie.ai/blog/instagram-algorithm" },
  { n: 4, publisher: "Heropost", title: "Instagram Algorithm Changes in 2026", url: "https://heropost.io/instagram-algorithm-changes-2026/" },
  { n: 5, publisher: "Mirra", title: "Instagram Algorithm 2026: What Works Best for Growth", url: "https://www.mirra.my/en/blog/instagram-algorithm-2026-complete-analysis" },
  { n: 6, publisher: "Buffer", title: "How the Instagram Algorithm Works: Your 2026 Guide", url: "https://buffer.com/resources/instagram-algorithms/" },
  { n: 7, publisher: "Orange Monke", title: "Instagram Algorithm 2026: Ranking Signals & Growth Tips", url: "https://orangemonke.com/blogs/instagram-algorithm/" },
  { n: 9, publisher: "Creatorflow", title: "Instagram Algorithm 2026: What Changed (+ How to Adapt)", url: "https://creatorflow.so/blog/instagram-algorithm-2026/" },
  { n: 10, publisher: "DataSlayer", title: "5 Ranking Signals Mosseri Confirmed", url: "https://www.dataslayer.ai/blog/instagram-algorithm-2025-complete-guide-for-marketers" },
  { n: 11, publisher: "Fanpage Karma", title: "Instagram Reels Algorithm 2025: Key Ranking Factors", url: "https://www.fanpagekarma.com/insights/instagram-reels-algorithm/" },
  { n: 12, publisher: "Torro", title: "Instagram Algorithm 2025 (Explained by Adam Mosseri)", url: "https://torro.io/blog/instagram-algorithm-2025-explained" },
  { n: 14, publisher: "Funnl", title: "Instagram Algorithm 2025: How It Works and How to Win", url: "https://funnl.ai/instagram-algorithm-2025-how-it-works-and-how-to-win/" },
  { n: 16, publisher: "Creatorflow", title: "2026 surface-by-surface signal breakdown", url: "https://creatorflow.so/blog/instagram-algorithm-2026/" },
  { n: 18, publisher: "Pano", title: "Best Practices for First-Slide Carousel Hooks", url: "https://panocollages.com/blog/best-practices-for-first-slide-carousel-hooks" },
  { n: 19, publisher: "Pineable", title: "Social Media Carousel Design Best Practices", url: "https://pineable.com/blog/social-media-carousel-design-best-practices" },
  { n: 20, publisher: "Futuristic Marketing", title: "Instagram Carousel Design: Complete Guide", url: "https://futuristicmarketingservices.com/Blogs/graphic-designing/instagram-carousel-design-guide/" },
  { n: 22, publisher: "Carouselli", title: "Instagram Carousel Best Practices 2026: 12 Rules", url: "https://carouselli.com/blog/instagram-carousel-best-practices" },
  { n: 24, publisher: "PostEverywhere", title: "Instagram Carousel Best Practices for More Engagement", url: "https://posteverywhere.ai/blog/instagram-carousel-best-practices" },
  { n: 27, publisher: "CampaignSwift", title: "Instagram Safe Zone Sizes Guide 2026", url: "https://campaignswift.com/blog/instagram-safe-zone-sizes" },
  { n: 28, publisher: "Blitzcut AI", title: "Best Caption Size for Instagram Reels (2026)", url: "https://blitzcutai.com/blog/best-caption-size-instagram-reels-2026" },
  { n: 32, publisher: "TryMyPost", title: "Instagram Reels Safe Zones & Text Placement 2026", url: "https://www.trymypost.com/blog/instagram-reels-safe-zones-text-placement-2026" },
  { n: 34, publisher: "Later", title: "Stories stickers for engagement", url: "https://later.com/blog/how-instagram-algorithm-works/" },
  { n: 36, publisher: "Storrito", title: "More Engagement with Polls and Questions", url: "https://storrito.com/resources/storrito-poll-question-stickers-instagram-2026-algorithm-replies/" },
  { n: 39, publisher: "Aurelius Media", title: "What Actually Works on Instagram in 2026", url: "https://www.aureliusmedia.co/blog/what-works-on-instagram-2026" },
  { n: 41, publisher: "Creatorflow", title: "Stories cadence & DM-reply strategy", url: "https://creatorflow.so/blog/instagram-algorithm-2026/" },
  { n: 44, publisher: "Vexub", title: "25 Viral Hook Formulas — TikTok & Reels", url: "https://vexub.com/blog/viral-short-form-video-hooks" },
  { n: 50, publisher: "Conbersa", title: "Best TikTok Hooks That Stop the Scroll in 2026", url: "https://www.conbersa.ai/learn/best-tiktok-hooks" },
];
