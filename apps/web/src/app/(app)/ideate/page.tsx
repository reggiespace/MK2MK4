import { prisma } from "@/lib/db";
import { IdeateClient } from "./ideate-client";

export default async function IdeatePage({
  searchParams,
}: {
  searchParams: Promise<{ brandId?: string }>;
}) {
  const { brandId: defaultBrandId } = await searchParams;

  const brands = await prisma.brand.findMany({
    orderBy: { key: "asc" },
    include: {
      pillars: { orderBy: { name: "asc" } },
      brandKit: { select: { defaultSkin: true } },
    },
  });

  const initialBrandId = defaultBrandId ?? brands[0]?.id;
  const initialIdeas = initialBrandId
    ? await prisma.idea.findMany({
        where: { brandId: initialBrandId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, title: true, angle: true, recommendedFormat: true },
      })
    : [];

  return (
    <IdeateClient
      brands={brands}
      defaultBrandId={defaultBrandId}
      initialIdeas={initialIdeas}
    />
  );
}
