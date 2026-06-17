import "server-only";
import OpenAI from "openai";
import { env } from "@/lib/env";
import { ideasPrompt, draftPrompt } from "./prompts";
import {
  draftResponseSchema,
  ideasResponseSchema,
  type BrandContext,
  type DraftResponse,
  type Idea,
} from "./types";

export interface LlmProvider {
  readonly name: string;
  suggestIdeas(
    brand: BrandContext,
    opts: { count: number; pillarName?: string; brief?: string },
  ): Promise<Idea[]>;
  draft(
    brand: BrandContext,
    opts: { title: string; angle: string; format?: string },
  ): Promise<DraftResponse>;
}

// ---------------------------------------------------------------------------
// OpenAI implementation
// ---------------------------------------------------------------------------
class OpenAiProvider implements LlmProvider {
  readonly name = "openai";
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  private async json(system: string, user: string): Promise<unknown> {
    const res = await this.client.chat.completions.create({
      model: this.model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const content = res.choices[0]?.message?.content ?? "{}";
    return JSON.parse(content);
  }

  async suggestIdeas(
    brand: BrandContext,
    opts: { count: number; pillarName?: string; brief?: string },
  ): Promise<Idea[]> {
    const { system, user } = ideasPrompt(brand, opts);
    const raw = await this.json(system, user);
    return ideasResponseSchema.parse(raw).ideas;
  }

  async draft(
    brand: BrandContext,
    opts: { title: string; angle: string; format?: string },
  ): Promise<DraftResponse> {
    const { system, user } = draftPrompt(brand, opts);
    const raw = await this.json(system, user);
    return draftResponseSchema.parse(raw);
  }
}

// ---------------------------------------------------------------------------
// Mock implementation — deterministic, locale-aware, claims-safe.
// Lets the whole pipeline run + be verified before an OpenAI key is set.
// ---------------------------------------------------------------------------
class MockProvider implements LlmProvider {
  readonly name = "mock";

  async suggestIdeas(
    brand: BrandContext,
    opts: { count: number; pillarName?: string; brief?: string },
  ): Promise<Idea[]> {
    const pt = brand.locale === "pt_BR";
    const pool = brand.pillars.length ? brand.pillars : [{ name: "General", description: "" }];
    const ideas: Idea[] = [];
    for (let i = 0; i < opts.count; i++) {
      const pillar = opts.pillarName
        ? { name: opts.pillarName, description: "" }
        : pool[i % pool.length];
      const fmt = (["carousel", "reel", "single"] as const)[i % 3];
      ideas.push(
        pt
          ? {
              title: `${pillar.name}: o que observar hoje`,
              angle: `Uma explicação calma sobre ${pillar.name.toLowerCase()}, com base nos seus registros.`,
              recommendedFormat: fmt,
              pillarName: pillar.name,
            }
          : {
              title: `${pillar.name}: what to watch today`,
              angle: `A calm explainer on ${pillar.name.toLowerCase()}, based on your logged data.`,
              recommendedFormat: fmt,
              pillarName: pillar.name,
            },
      );
    }
    return ideas;
  }

  async draft(
    brand: BrandContext,
    opts: { title: string; angle: string; format?: string },
  ): Promise<DraftResponse> {
    const pt = brand.locale === "pt_BR";
    const format = (opts.format as DraftResponse["recommendedFormat"]) ?? "carousel";
    const caption = pt
      ? `${opts.angle} Deslize para entender o porquê 👇 (carga gástrica estimada por modelo, com base nos seus registros).`
      : `${opts.angle} Swipe to see why 👇 (model-estimated gastric load, based on your logged data).`;
    const hashtags = pt
      ? ["GLP1", "Ozempic", "Mounjaro", "saudedigestiva", "foodnoise"]
      : ["GLP1", "Ozempic", "Wegovy", "foodnoise", "Mounjaro"];

    const slides: DraftResponse["slides"] =
      format === "single"
        ? [{ role: "cover", eyebrow: opts.title, headline: opts.title, imagePrompt: "fresh vegetables and grains on a bright kitchen counter" }]
        : format === "reel"
          ? [
              { role: "cover", eyebrow: pt ? "Reel" : "Reel", headline: opts.title, imagePrompt: "warm bowl of oats with blueberries on a wooden table" },
              { role: "body", headline: pt ? "O ciclo tem pico e queda." : "The cycle peaks, then fades.", imagePrompt: "glass of water beside fresh herbs on a sunlit surface" },
              { role: "body", headline: pt ? "A fome pode mudar no dia 4–5." : "Hunger can shift on day 4–5.", imagePrompt: "sliced avocado and whole grain bread arranged neatly" },
              { role: "body", headline: pt ? "Isso costuma ser esperado." : "This is often expected.", imagePrompt: "calm morning kitchen scene with a mug of tea" },
            ]
          : [
              { role: "cover", eyebrow: brand.pillars[0]?.name ?? "Tip", headline: opts.title, imagePrompt: "colorful fresh produce arranged on a bright wooden board" },
              {
                role: "body",
                eyebrow: pt ? "O ciclo" : "The cycle",
                headline: pt ? "Pico e depois queda." : "It peaks, then fades.",
                body: pt
                  ? "A supressão do apetite não é constante na semana."
                  : "Appetite suppression isn't flat across the week.",
                imagePrompt: "sliced citrus fruit and herbs on a marble surface",
              },
              {
                role: "body",
                eyebrow: pt ? "Dia 4–5" : "Day 4–5",
                headline: pt ? "A fome pode voltar." : "Food noise can return.",
                body: pt
                  ? "Costuma ser esperado quando o efeito cai — não é falta de força de vontade."
                  : "Often expected as the effect dips — not a willpower failure.",
                imagePrompt: "whole grain crackers and hummus on a linen cloth",
              },
              {
                role: "cta",
                headline: pt
                  ? "Veja onde você está no ciclo. Gastric IQ — grátis para sempre."
                  : "See where you are in your cycle. Gastric IQ — free forever.",
                imagePrompt: "warm kitchen window light on a clean countertop with greenery",
              },
            ];

    return {
      caption,
      hashtags,
      recommendedFormat: format,
      formatRationale: pt
        ? "Conteúdo educativo em etapas funciona melhor neste formato."
        : "Step-by-step educational content performs best in this format.",
      slides,
      voiceover:
        format === "reel"
          ? pt
            ? "O efeito do seu GLP-1 tem pico e depois diminui ao longo da semana. Por volta do dia quatro ou cinco, a fome pode voltar. Isso costuma ser esperado, com base nos seus registros."
            : "Your GLP-1 effect peaks and then fades across the week. Around day four or five, food noise can return. This is often expected, based on your logged data."
          : null,
    };
  }
}

export function getLlmProvider(): LlmProvider {
  const key = env.openaiApiKey();
  if (key) return new OpenAiProvider(key, env.openaiModel());
  return new MockProvider();
}
