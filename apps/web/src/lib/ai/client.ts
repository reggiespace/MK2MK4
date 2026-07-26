import "server-only";
import OpenAI from "openai";
import { env } from "@/lib/env";
import { requireCredential } from "@/lib/integrations";
import { Provider } from "@/generated/prisma/enums";

/** OpenAI client for a workspace, using its key when set or the platform's. */
export async function openaiFor(workspaceId: string): Promise<{ client: OpenAI; model: string }> {
  const cred = await requireCredential(workspaceId, Provider.openai);
  return { client: new OpenAI({ apiKey: cred.apiKey }), model: env.openaiModel() };
}

/**
 * One structured-output call. `schema` must be a strict JSON schema; the model
 * is instructed to fill it exactly, and the raw parsed object is returned for
 * the caller to coerce against the manifest.
 */
export async function completeJson(
  workspaceId: string,
  schemaName: string,
  schema: Record<string, unknown>,
  system: string,
  user: string,
): Promise<unknown> {
  const { client, model } = await openaiFor(workspaceId);
  const res = await client.chat.completions.create({
    model,
    response_format: {
      type: "json_schema",
      json_schema: { name: schemaName, schema, strict: true },
    },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  const content = res.choices[0]?.message?.content;
  if (!content) throw new Error("The model returned an empty response.");
  return JSON.parse(content);
}
