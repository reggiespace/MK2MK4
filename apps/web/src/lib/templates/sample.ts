/**
 * Sample fill for template previews.
 *
 * The Template step renders a live miniature of each archetype rather than an
 * icon, so the cards need representative copy before anything is generated.
 * This is preview art only — never persisted to a draft and never published.
 * Ported from the design's content pack so the miniatures read exactly as the
 * design intends.
 */

import type { SlideDoc, SlotValue, TemplateStyleId } from "./types";

type Pack = {
  cover: Record<string, string>;
  point: Record<string, string>;
  stat: Record<string, string>;
  list: { heading: string; items: { lead: string; detail: string }[] };
  image: Record<string, string>;
  myth: Record<string, string>;
  cta: { kicker: string; hook: string; recap: string[]; followLine: string };
  reel: Record<string, string>;
  story: Record<string, string | { t: string; correct: boolean }[]> & { quizOptions: { t: string; correct: boolean }[] };
  announce: Record<string, string>;
  photo: Record<string, string>;
};

const EN: Pack = {
  cover: {
    kicker: "THE PATTERN",
    hook: "Food noise peaks before it fades",
    hookLong: "The 3 p.m. window nobody warns you about",
    lead: "Why appetite creeps back mid-cycle — and the 90-second habit that steadies it.",
    statValue: "3PM",
    statLine: "is when most fade-day cravings quietly spike",
    source: "Gastric IQ cycle data, 2026",
    quote: "It's a rhythm, not a flaw in your willpower.",
    attribution: "— what we tell every new member",
  },
  point: {
    index: "01",
    label: "THE WINDOW",
    heading: "Name the hour it hits",
    body: "Cravings aren't random. Track the clock for three days and the fade-day pattern shows itself.",
  },
  stat: { label: "THE LIFT", statValue: "+90s", statLine: "of protein-first eating steadies the whole afternoon" },
  list: {
    heading: "Three moves for the 3 p.m. dip",
    items: [
      { lead: "Protein before carbs", detail: "20g takes the edge off fast." },
      { lead: "Water, then wait ten", detail: "Thirst mimics the craving." },
      { lead: "Log the hour", detail: "Naming it shrinks it." },
    ],
  },
  image: {
    caption: "A plate built protein-first",
    captionSub: "Same food, different order — the afternoon holds.",
    prompt: "warm overhead shot of a protein-first plate on a linen table, soft daylight",
  },
  myth: { myth: "Cravings mean you lack willpower", fact: "They're a scheduled dip in the medication cycle." },
  cta: {
    kicker: "Keep this",
    hook: "Save it for your next fade day",
    recap: ["Name the hour", "Protein before carbs", "Log it, shrink it"],
    followLine: "Follow for the rhythm.",
  },
  reel: {
    hookKicker: "Stop scrolling if",
    hook: "Your hunger runs on a schedule",
    hookVoice: "If your hunger feels louder some days than others, it's not willpower — it's your medication cycle.",
    q: "Why is 3 p.m. always the hardest?",
    qSub: "It's not just in your head",
    preWord: "It's not",
    bigWord: "willpower",
    kSub: "It's your medication cycle",
    titleKicker: "A 30-second read",
    title: "The peak-and-fade rhythm",
    titleSub: "What shifts across your dosing week",
    titleVoice: "Here's the peak-and-fade rhythm, and what shifts across your dosing week.",
    caption: "Food noise gets loud right before the fade",
    captionVoice: "Food noise gets loud right before the dose fades.",
    endKicker: "Your next fade day",
    endHook: "Save this before it hits",
    endVoice: "Save this before your next fade day, and follow for the rhythm.",
  },
  story: {
    pollKicker: "Quick gut check",
    pollPrompt: "Does 3 p.m. hit you too?",
    optionA: "Every fade day",
    optionB: "Not really",
    qPrompt: "Ask us about your GLP-1 week",
    stickerLabel: "Type your question…",
    quizKicker: "True or false",
    quizPrompt: "Cravings mean weak willpower",
    quizOptions: [
      { t: "True", correct: false },
      { t: "False", correct: true },
    ],
    sliderPrompt: "How loud is your food noise today?",
    emoji: "🔊",
    cdKicker: "Launching soon",
    cdHeadline: "The fade-day planner",
    targetTime: "Aug 1, 9:00 AM",
    linkLabel: "Get the app",
    linkUrl: "https://example.com",
    flag: "New post",
    postRef: "ig:post/3p-checkpoint",
  },
  announce: { headline: "Your fade-day planner is here", sub: "Plan protein around the dip → link in bio" },
  photo: {
    kicker: "IN THE KITCHEN",
    headline: "Smaller plates, steadier week",
    tag: "Field note · 07",
    caption: "Bedtime load, lightened",
    captionSub: "Why late meals feel heavier — and the evening window to watch.",
    body: "Same portions, earlier clock — the night holds.",
    quote: "The evening window changed everything for me.",
    attribution: "— A. R., member since 2025",
    prompt: "warm lifestyle kitchen photo, protein-first plate on linen, soft daylight, washed tones",
  },
};

const PT: Pack = {
  cover: {
    kicker: "O PADRÃO",
    hook: "A fome dá pico antes de cair",
    hookLong: "A janela das 15h que ninguém te avisa",
    lead: "Por que o apetite volta no meio do ciclo — e o hábito de 90 segundos que estabiliza.",
    statValue: "15H",
    statLine: "é quando a maioria dos picos de fome aparece",
    source: "Dados de ciclo Gastric IQ, 2026",
    quote: "É um ritmo, não uma falha na sua força de vontade.",
    attribution: "— o que dizemos a cada novo membro",
  },
  point: {
    index: "01",
    label: "A JANELA",
    heading: "Dê nome à hora do pico",
    body: "A fome não é aleatória. Anote o relógio por três dias e o padrão dos dias de queda aparece.",
  },
  stat: { label: "O GANHO", statValue: "+90s", statLine: "de comer proteína primeiro estabiliza toda a tarde" },
  list: {
    heading: "Três passos para a queda das 15h",
    items: [
      { lead: "Proteína antes dos carbos", detail: "20g tiram o pico rápido." },
      { lead: "Água e espere dez", detail: "A sede imita a fome." },
      { lead: "Anote a hora", detail: "Dar nome diminui." },
    ],
  },
  image: {
    caption: "Um prato com proteína primeiro",
    captionSub: "A mesma comida, outra ordem — a tarde se mantém.",
    prompt: "foto aérea quente de um prato com proteína primeiro sobre linho, luz suave",
  },
  myth: { myth: "Fome é falta de força de vontade", fact: "É uma queda programada no ciclo da medicação." },
  cta: {
    kicker: "Guarde isto",
    hook: "Salve para o seu próximo dia de queda",
    recap: ["Dê nome à hora", "Proteína antes dos carbos", "Anote e diminua"],
    followLine: "Siga pelo ritmo.",
  },
  reel: {
    hookKicker: "Pare se",
    hook: "Sua fome segue um horário",
    hookVoice: "Se sua fome parece mais alta em alguns dias, não é força de vontade — é o ciclo da sua medicação.",
    q: "Por que as 15h são sempre as mais difíceis?",
    qSub: "Não é só impressão sua",
    preWord: "Não é",
    bigWord: "vontade",
    kSub: "É o ciclo da medicação",
    titleKicker: "Uma leitura de 30s",
    title: "O ritmo de pico e queda",
    titleSub: "O que muda na sua semana de dose",
    titleVoice: "Aqui está o ritmo de pico e queda, e o que muda na sua semana de dose.",
    caption: "A fome fica alta bem antes da queda",
    captionVoice: "A fome fica alta bem antes da dose cair.",
    endKicker: "Seu próximo dia de queda",
    endHook: "Salve antes de acontecer",
    endVoice: "Salve antes do seu próximo dia de queda e siga pelo ritmo.",
  },
  story: {
    pollKicker: "Teste rápido",
    pollPrompt: "As 15h pegam você também?",
    optionA: "Todo dia de queda",
    optionB: "Nem tanto",
    qPrompt: "Pergunte sobre sua semana de GLP-1",
    stickerLabel: "Escreva sua pergunta…",
    quizKicker: "Verdadeiro ou falso",
    quizPrompt: "Fome significa vontade fraca",
    quizOptions: [
      { t: "Verdadeiro", correct: false },
      { t: "Falso", correct: true },
    ],
    sliderPrompt: "Quão alta está sua fome hoje?",
    emoji: "🔊",
    cdKicker: "Em breve",
    cdHeadline: "O planejador de dias de queda",
    targetTime: "1 ago, 09:00",
    linkLabel: "Baixar o app",
    linkUrl: "https://example.com",
    flag: "Novo post",
    postRef: "ig:post/checkpoint-15h",
  },
  announce: { headline: "Seu planejador de dias de queda chegou", sub: "Planeje a proteína na queda → link na bio" },
  photo: {
    kicker: "NA COZINHA",
    headline: "Pratos menores, semana estável",
    tag: "Nota de campo · 07",
    caption: "Carga da noite, aliviada",
    captionSub: "Por que refeições tardias pesam mais — e a janela da noite para observar.",
    body: "As mesmas porções, mais cedo — a noite se mantém.",
    quote: "A janela da noite mudou tudo para mim.",
    attribution: "— A. R., membro desde 2025",
    prompt: "foto lifestyle de cozinha aquecida, prato com proteína primeiro sobre linho, luz suave",
  },
};

/** Sample slot values for one kind, used only to render preview art. */
export function sampleFields(
  style: TemplateStyleId,
  kind: string,
  locale: "en" | "pt_BR" = "en",
): Record<string, SlotValue> {
  const c = locale === "pt_BR" ? PT : EN;

  // Two kind ids are shared across formats and need disambiguating.
  if (kind === "1b-question") {
    return style === "reel"
      ? { hook: c.reel.q, sub: c.reel.qSub, voiceScript: c.reel.hookVoice }
      : { prompt: c.story.qPrompt, stickerLabel: c.story.stickerLabel };
  }
  if (style === "single" && kind === "1b-quote") {
    return { kicker: "In our words", quote: c.cover.quote, attribution: c.cover.attribution };
  }

  const map: Record<string, Record<string, SlotValue>> = {
    "1a-knockout": { kicker: c.cover.kicker, hook: c.cover.hook },
    "1b-editorial": { kicker: "Dispatch · No.04", hook: c.cover.hookLong, lead: c.cover.lead },
    "1c-bigstat": {
      kicker: c.cover.kicker,
      statValue: c.cover.statValue,
      statLine: c.cover.statLine,
      source: c.cover.source,
    },
    "1d-quote": { kicker: "In our words", quote: c.cover.quote, attribution: c.cover.attribution },
    "2a-point": { index: c.point.index, label: c.point.label, heading: c.point.heading, body: c.point.body },
    "2b-stat": { label: c.stat.label, statValue: c.stat.statValue, statLine: c.stat.statLine },
    "2c-list": { heading: c.list.heading, items: c.list.items.map((i) => ({ ...i })) },
    "2d-image": { image: null, caption: c.image.caption, captionSub: c.image.captionSub },
    "2e-myth": { myth: c.myth.myth, fact: c.myth.fact },
    "2f-cta": { kicker: c.cta.kicker, hook: c.cta.hook, recap: [...c.cta.recap], followLine: c.cta.followLine },
    "1a-statement": {
      kicker: c.reel.hookKicker,
      hook: c.reel.hook,
      image: null,
      voiceScript: c.reel.hookVoice,
    },
    "1c-kinetic": {
      preWord: c.reel.preWord,
      bigWord: c.reel.bigWord,
      sub: c.reel.kSub,
      voiceScript: c.reel.hookVoice,
    },
    "1d-title": {
      kicker: c.reel.titleKicker,
      title: c.reel.title,
      sub: c.reel.titleSub,
      image: null,
      voiceScript: c.reel.titleVoice,
    },
    "1e-caption": { caption: c.reel.caption, image: null, voiceScript: c.reel.captionVoice },
    "1f-cta": {
      kicker: c.reel.endKicker,
      hook: c.reel.endHook,
      recap: [...c.cta.recap],
      voiceScript: c.reel.endVoice,
    },
    "1a-poll": {
      kicker: c.story.pollKicker,
      prompt: c.story.pollPrompt,
      optionA: c.story.optionA,
      optionB: c.story.optionB,
      image: null,
    },
    "1c-quiz": {
      kicker: c.story.quizKicker,
      prompt: c.story.quizPrompt,
      options: c.story.quizOptions.map((o) => ({ ...o })),
    },
    "1d-slider": { prompt: c.story.sliderPrompt, emoji: c.story.emoji },
    "1e-countdown": {
      kicker: c.story.cdKicker,
      headline: c.story.cdHeadline,
      targetTime: c.story.targetTime,
      linkLabel: c.story.linkLabel,
      linkUrl: c.story.linkUrl,
    },
    "1f-reshare": { flag: c.story.flag, postRef: c.story.postRef },
    "1a-stat": {
      kicker: c.cover.kicker,
      statValue: c.cover.statValue,
      statLine: c.cover.statLine,
      source: c.cover.source,
    },
    "1c-myth": { myth: c.myth.myth, fact: c.myth.fact },
    "1d-announce": {
      pill: "New",
      kicker: "Just launched",
      headline: c.announce.headline,
      sub: c.announce.sub,
    },
    "1a-lifestyle": { image: null, imagePrompt: c.photo.prompt, kicker: c.photo.kicker, headline: c.photo.headline },
    "1b-fieldnote": {
      image: null,
      imagePrompt: c.photo.prompt,
      tag: c.photo.tag,
      caption: c.photo.caption,
      captionSub: c.photo.captionSub,
    },
    "1c-split": {
      image: null,
      imagePrompt: c.photo.prompt,
      kicker: c.photo.kicker,
      headline: c.photo.headline,
      body: c.photo.body,
    },
    "1d-photoquote": {
      image: null,
      imagePrompt: c.photo.prompt,
      quote: c.photo.quote,
      attribution: c.photo.attribution,
    },
  };

  return structuredClone(map[kind] ?? {});
}

export function sampleSlide(style: TemplateStyleId, kind: string, locale: "en" | "pt_BR" = "en"): SlideDoc {
  return { kind, f: sampleFields(style, kind, locale) };
}
