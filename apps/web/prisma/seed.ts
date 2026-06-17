import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// Vessel design tokens (source of truth: gastric-iq apps/web/src/index.css)
const VESSEL_TOKENS = {
  light: { bg: "#ECE6D6", ink: "#1A2230", moss: "#5C7556", slate: "#3B5A78", brass: "#B89251", muted: "#6E6952" },
  dark: { bg: "#0E141B", fg: "#E5DECC", moss: "#94AE8A", slate: "#7AA0C7", brass: "#C9A472", muted: "#968F77" },
  markGradient: ["#3B5A78", "#2F5D63", "#5C7556"],
};

const FONTS = { display: "Spectral", body: "Albert Sans", mono: "IBM Plex Mono" };

const TONE_EN = `Voice: shame-free, value-first, calm, supportive, "digestion intelligence".
Always say "model-estimated gastric load" (never "measured"); "based on published GLP-1 pharmacokinetic parameters"; "based on your logged data".
Never claim Gastric IQ causes weight loss, prevents side effects/nausea, prevents muscle loss, diagnoses, or replaces medical advice. No shame/judgment language. No "AI doctor", "HIPAA compliant", "better than <competitor>", or "unlimited everything for free".`;

const TONE_PT = `Tom: sem culpa, foco em valor, calmo, acolhedor, "inteligência da digestão".
Sempre diga "carga gástrica estimada por modelo" (nunca "medida"); "com base em parâmetros farmacocinéticos publicados de GLP-1"; "com base nos seus registros".
Nunca afirme que o Gastric IQ causa perda de peso, previne efeitos colaterais/náusea, previne perda muscular, diagnostica ou substitui orientação médica. Sem linguagem de culpa/julgamento. Sem "médico de IA", "compatível com HIPAA", "melhor que <concorrente>" ou "tudo ilimitado de graça".`;

const PILLARS_EN = [
  { name: "Medication-cycle education", description: "Peak, fade, food noise, and careful eating windows across the GLP-1 cycle." },
  { name: "Side-effect readiness (without fear)", description: "Nausea, reflux, fullness, bedtime load, hydration — framed calmly, never alarming." },
  { name: "Protein & lean mass", description: "Progress beyond the scale: protein-first habits and lean-mass awareness." },
  { name: "Bariatric guidance", description: "Smaller meals, protein priority, pouch sensitivity for post-surgery users." },
  { name: "Trust & privacy", description: "Clear data use, export, deletion, and no manipulative pricing." },
];

const PILLARS_PT = [
  { name: "Educação sobre o ciclo da medicação", description: "Pico, queda, fome (food noise) e janelas de alimentação ao longo do ciclo de GLP-1." },
  { name: "Preparo para efeitos colaterais (sem medo)", description: "Náusea, refluxo, saciedade, carga noturna, hidratação — de forma calma, nunca alarmante." },
  { name: "Proteína e massa magra", description: "Progresso além da balança: hábitos com proteína em primeiro lugar e atenção à massa magra." },
  { name: "Orientação bariátrica", description: "Refeições menores, prioridade à proteína e sensibilidade do estômago para pós-cirúrgicos." },
  { name: "Confiança e privacidade", description: "Uso claro de dados, exportação, exclusão e sem preços manipuladores." },
];

async function seedBrand(opts: {
  key: string;
  name: string;
  locale: "en" | "pt_BR";
  publisher: "buffer" | "zernio";
  tone: string;
  pillars: { name: string; description: string }[];
}) {
  const brand = await prisma.brand.upsert({
    where: { key: opts.key },
    update: { name: opts.name, locale: opts.locale, publisher: opts.publisher },
    create: {
      key: opts.key,
      name: opts.name,
      locale: opts.locale,
      publisher: opts.publisher,
      channels: [
        { network: "facebook", channelId: "", label: "TODO: set channel id" },
        { network: "instagram", channelId: "", label: "TODO: set channel id" },
      ],
    },
  });

  await prisma.brandKit.upsert({
    where: { brandId: brand.id },
    update: { tokens: VESSEL_TOKENS, fonts: FONTS, toneGuide: opts.tone },
    create: {
      brandId: brand.id,
      logoPath: "brands/logo-iq-transparent.png",
      tokens: VESSEL_TOKENS,
      fonts: FONTS,
      defaultSkin: "mark_forward",
      artDirection: "warm_lifestyle",
      toneGuide: opts.tone,
      voiceId: "", // TODO: set ElevenLabs voice id per locale
    },
  });

  for (const p of opts.pillars) {
    await prisma.pillar.upsert({
      where: { brandId_name: { brandId: brand.id, name: p.name } },
      update: { description: p.description },
      create: { brandId: brand.id, name: p.name, description: p.description },
    });
  }

  return brand;
}

async function main() {
  await seedBrand({
    key: "gastric-us",
    name: "Gastric IQ",
    locale: "en",
    publisher: "buffer",
    tone: TONE_EN,
    pillars: PILLARS_EN,
  });
  await seedBrand({
    key: "gastric-br",
    name: "Gastric IQ Brasil",
    locale: "pt_BR",
    publisher: "zernio",
    tone: TONE_PT,
    pillars: PILLARS_PT,
  });
  console.log("Seed complete: 2 brands, 2 brand kits, 10 pillars.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
