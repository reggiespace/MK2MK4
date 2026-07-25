#!/usr/bin/env node
/**
 * First-run bootstrap for the container.
 *
 * Creates the owner workspace, the sign-in user, and the brand accounts with
 * their pillars and channels. Written against `pg` rather than the Prisma
 * client because the slim runtime image has no @prisma/engines binaries — the
 * same reason run-migrations.js exists.
 *
 * Idempotent: every statement upserts, so it is safe on every boot.
 *
 * Keep in step with apps/web/prisma/seed.ts, which does the same thing for
 * local development.
 */
const { Client } = require("/migrations-deps/node_modules/pg");
const bcrypt = require("/app/apps/web/node_modules/bcryptjs");
const crypto = require("crypto");

const cuid = () => "c" + crypto.randomBytes(12).toString("hex");

const VOICE_EN = `Shame-free, value-first, calm and supportive — "digestion intelligence".
Always say "model-estimated gastric load" (never "measured"); "based on published GLP-1 pharmacokinetic parameters"; "based on your logged data".
Never claim Gastric IQ causes weight loss, prevents side effects or nausea, prevents muscle loss, diagnoses, or replaces medical advice. No shame or judgment language.`;

const VOICE_PT = `Sem culpa, foco em valor, calmo e acolhedor — "inteligência da digestão".
Sempre diga "carga gástrica estimada por modelo" (nunca "medida"); "com base em parâmetros farmacocinéticos publicados de GLP-1"; "com base nos seus registros".
Nunca afirme que o Gastric IQ causa perda de peso, previne efeitos colaterais ou náusea, previne perda muscular, diagnostica ou substitui orientação médica.`;

const ACCOUNTS = [
  {
    key: "gastric-us",
    name: "Gastric IQ",
    locale: "en",
    handle: "@gastric_iq",
    initials: "IQ",
    mark: "linear-gradient(135deg,#3b5a78,#5c7556)",
    accent: "#5c7556",
    voice: VOICE_EN,
    envPrefix: "US",
    pillars: [
      "Medication-cycle education",
      "Side-effect readiness",
      "Protein & lean mass",
      "Bariatric guidance",
      "Trust & privacy",
    ],
  },
  {
    key: "gastric-br",
    name: "Gastric IQ Brasil",
    locale: "pt_BR",
    handle: "@gastric_iq_brasil",
    initials: "BR",
    mark: "linear-gradient(135deg,#5c7556,#b89251)",
    accent: "#b89251",
    voice: VOICE_PT,
    envPrefix: "BR",
    pillars: [
      "Ciclo da medicação",
      "Efeitos colaterais",
      "Proteína e massa magra",
      "Orientação bariátrica",
      "Confiança e privacidade",
    ],
  },
];

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const { rows: wsRows } = await client.query(
    `INSERT INTO "Workspace" (id, name, slug, plan, "createdAt", "updatedAt")
     VALUES ($1, 'ReggieSpace', 'reggiespace', 'owner', now(), now())
     ON CONFLICT (slug) DO UPDATE SET "updatedAt" = now()
     RETURNING id`,
    [cuid()],
  );
  const workspaceId = wsRows[0].id;

  const email = (process.env.OPERATOR_EMAIL || "").toLowerCase();
  const password = process.env.OPERATOR_PASSWORD || "";
  if (email && password) {
    await client.query(
      `INSERT INTO "User" (id, "workspaceId", email, "passwordHash", "createdAt")
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (email) DO UPDATE SET "workspaceId" = EXCLUDED."workspaceId"`,
      [cuid(), workspaceId, email, await bcrypt.hash(password, 12)],
    );
    console.log(`[init] user ${email}`);
  } else {
    console.warn("[init] OPERATOR_EMAIL/OPERATOR_PASSWORD unset — no sign-in account created.");
  }

  for (const a of ACCOUNTS) {
    const { rows } = await client.query(
      `INSERT INTO "BrandAccount"
         (id, "workspaceId", key, name, locale, handle, initials, mark, accent,
          "voiceDescription", tones, "readingLevel", "claimsGuardrail", "downloadUrl",
          "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5::"Locale",$6,$7,$8,$9,$10,
               ARRAY['Calm','Warm','Evidence-led'],'grade7'::"ReadingLevel",true,$11, now(), now())
       ON CONFLICT ("workspaceId", key) DO UPDATE
         SET name = EXCLUDED.name, handle = EXCLUDED.handle, "updatedAt" = now()
       RETURNING id`,
      [
        cuid(), workspaceId, a.key, a.name, a.locale, a.handle, a.initials,
        a.mark, a.accent, a.voice, process.env.DOWNLOAD_URL || "https://gastriciq.app",
      ],
    );
    const accountId = rows[0].id;

    for (const [i, name] of a.pillars.entries()) {
      await client.query(
        `INSERT INTO "Pillar" (id, "accountId", name, position)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT ("accountId", name) DO UPDATE SET position = EXCLUDED.position`,
        [cuid(), accountId, name, i],
      );
    }

    for (const platform of ["instagram", "facebook"]) {
      const external =
        process.env[`POSTIZ_CHANNEL_${a.envPrefix}_${platform.toUpperCase()}`] || null;
      await client.query(
        `INSERT INTO "Channel" (id, "accountId", platform, handle, "externalId", enabled, "createdAt")
         VALUES ($1,$2,$3::"Platform",$4,$5,true, now())
         ON CONFLICT ("accountId", platform) DO UPDATE
           SET "externalId" = COALESCE(EXCLUDED."externalId", "Channel"."externalId")`,
        [cuid(), accountId, platform, a.handle, external],
      );
      if (!external) {
        console.warn(
          `[init] POSTIZ_CHANNEL_${a.envPrefix}_${platform.toUpperCase()} unset — ` +
            `${a.name} ${platform} cannot publish until a channel id is set in Settings.`,
        );
      }
    }
    console.log(`[init] account ${a.name}`);
  }

  await client.end();
}

main().catch((err) => {
  console.error("[init] failed:", err.message);
  process.exit(1);
});
