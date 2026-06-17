import "server-only";
import { prisma } from "@/lib/db";
import type { BrandContext } from "@/lib/llm/types";

export interface FullBrand {
  id: string;
  key: string;
  name: string;
  locale: "en" | "pt_BR";
  publisher: "buffer" | "zernio";
  context: BrandContext;
}

export async function loadBrand(brandId: string): Promise<FullBrand | null> {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    include: { brandKit: true, pillars: { orderBy: { name: "asc" } } },
  });
  if (!brand) return null;
  return {
    id: brand.id,
    key: brand.key,
    name: brand.name,
    locale: brand.locale,
    publisher: brand.publisher,
    context: {
      name: brand.name,
      locale: brand.locale,
      toneGuide: brand.brandKit?.toneGuide ?? "",
      pillars: brand.pillars.map((p) => ({ name: p.name, description: p.description })),
    },
  };
}
