import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

/**
 * Seeds the ReggieSpace workspace ("customer zero") with the two Gastric IQ
 * brand accounts, their voice, pillars and channels.
 *
 * Idempotent — safe to re-run. Real channel ids and the operator password come
 * from the environment so nothing sensitive lives in source.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const VOICE_EN = `Shame-free, value-first, calm and supportive — "digestion intelligence".
Always say "model-estimated gastric load" (never "measured"); "based on published GLP-1 pharmacokinetic parameters"; "based on your logged data".
Never claim Gastric IQ causes weight loss, prevents side effects or nausea, prevents muscle loss, diagnoses, or replaces medical advice. No shame or judgment language. No "AI doctor", "HIPAA compliant", "better than <competitor>", or "unlimited everything for free".`;

const VOICE_PT = `Sem culpa, foco em valor, calmo e acolhedor — "inteligência da digestão".
Sempre diga "carga gástrica estimada por modelo" (nunca "medida"); "com base em parâmetros farmacocinéticos publicados de GLP-1"; "com base nos seus registros".
Nunca afirme que o Gastric IQ causa perda de peso, previne efeitos colaterais ou náusea, previne perda muscular, diagnostica ou substitui orientação médica. Sem linguagem de culpa ou julgamento. Sem "médico de IA", "compatível com HIPAA", "melhor que <concorrente>" ou "tudo ilimitado de graça".`;

const PILLARS_EN = [
  "Medication-cycle education",
  "Side-effect readiness",
  "Protein & lean mass",
  "Bariatric guidance",
  "Trust & privacy",
];

const PILLARS_PT = [
  "Ciclo da medicação",
  "Efeitos colaterais",
  "Proteína e massa magra",
  "Orientação bariátrica",
  "Confiança e privacidade",
];

/**
 * Postiz integration ids per brand + platform, read from env so real channel
 * ids never live in source. Fetch them from `GET /public/v1/integrations`.
 */
function channelId(prefix: string, platform: "FACEBOOK" | "INSTAGRAM"): string | null {
  return process.env[`POSTIZ_CHANNEL_${prefix}_${platform}`] || null;
}

async function seedAccount(
  workspaceId: string,
  opts: {
    key: string;
    name: string;
    locale: "en" | "pt_BR";
    handle: string;
    initials: string;
    mark: string;
    accent: string;
    voice: string;
    pillars: string[];
    envPrefix: string;
    downloadUrl: string;
  },
) {
  const account = await prisma.brandAccount.upsert({
    where: { workspaceId_key: { workspaceId, key: opts.key } },
    update: {
      name: opts.name,
      locale: opts.locale,
      handle: opts.handle,
      initials: opts.initials,
      mark: opts.mark,
      accent: opts.accent,
      voiceDescription: opts.voice,
      downloadUrl: opts.downloadUrl,
    },
    create: {
      workspaceId,
      key: opts.key,
      name: opts.name,
      locale: opts.locale,
      handle: opts.handle,
      initials: opts.initials,
      mark: opts.mark,
      accent: opts.accent,
      voiceDescription: opts.voice,
      tones: ["Calm", "Warm", "Evidence-led"],
      readingLevel: "grade7",
      claimsGuardrail: true,
      downloadUrl: opts.downloadUrl,
    },
  });

  for (const [i, name] of opts.pillars.entries()) {
    await prisma.pillar.upsert({
      where: { accountId_name: { accountId: account.id, name } },
      update: { position: i },
      create: { accountId: account.id, name, position: i },
    });
  }

  for (const platform of ["instagram", "facebook"] as const) {
    const external = channelId(opts.envPrefix, platform.toUpperCase() as "FACEBOOK" | "INSTAGRAM");
    await prisma.channel.upsert({
      where: { accountId_platform: { accountId: account.id, platform } },
      update: { externalId: external, handle: opts.handle },
      create: { accountId: account.id, platform, handle: opts.handle, externalId: external, enabled: true },
    });
    if (!external) {
      console.warn(
        `  ! No POSTIZ_CHANNEL_${opts.envPrefix}_${platform.toUpperCase()} set — ${opts.name} ${platform} cannot publish until it is.`,
      );
    }
  }

  console.log(`  ✓ ${opts.name}`);
  return account;
}

async function main() {
  const workspace = await prisma.workspace.upsert({
    where: { slug: "reggiespace" },
    update: {},
    create: { name: "ReggieSpace", slug: "reggiespace", plan: "owner" },
  });
  console.log(`Workspace: ${workspace.name}`);

  const email = (process.env.OPERATOR_EMAIL ?? "").toLowerCase();
  const password = process.env.OPERATOR_PASSWORD ?? "";
  if (email && password) {
    await prisma.user.upsert({
      where: { email },
      update: { workspaceId: workspace.id },
      create: {
        workspaceId: workspace.id,
        email,
        passwordHash: await bcrypt.hash(password, 12),
      },
    });
    console.log(`  ✓ user ${email}`);
  } else {
    console.warn("  ! Set OPERATOR_EMAIL and OPERATOR_PASSWORD to create the sign-in account.");
  }

  await seedAccount(workspace.id, {
    key: "gastric-us",
    name: "Gastric IQ",
    locale: "en",
    handle: "@gastric_iq",
    initials: "IQ",
    mark: "linear-gradient(135deg,#3b5a78,#5c7556)",
    accent: "#5c7556",
    voice: VOICE_EN,
    pillars: PILLARS_EN,
    envPrefix: "US",
    downloadUrl: "https://gastriciq.app",
  });

  await seedAccount(workspace.id, {
    key: "gastric-br",
    name: "Gastric IQ Brasil",
    locale: "pt_BR",
    handle: "@gastric_iq_brasil",
    initials: "BR",
    mark: "linear-gradient(135deg,#5c7556,#b89251)",
    accent: "#b89251",
    voice: VOICE_PT,
    pillars: PILLARS_PT,
    envPrefix: "BR",
    downloadUrl: "https://gastriciq.app",
  });

  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
