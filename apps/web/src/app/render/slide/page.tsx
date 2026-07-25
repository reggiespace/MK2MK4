import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Slide } from "@/components/slide/Slide";
import { getManifest } from "@/lib/templates/manifests";
import { verifyRenderToken } from "@/lib/render";
import type { PostDoc, TemplateStyleId } from "@/lib/templates/types";

/**
 * The export surface. Headless Chromium navigates here per slide and
 * screenshots the body at the template's real canvas size.
 *
 * This deliberately renders the same `<Slide>` component the wizard previews,
 * scaled up from its base size — one renderer, many sizes. Never fork this into
 * a separate "print" renderer.
 *
 * Unauthenticated by necessity (the browser carries no session), so access is
 * gated by an HMAC token tied to the post id.
 */

export const dynamic = "force-dynamic";

export default async function RenderSlidePage(props: {
  searchParams: Promise<{ post?: string; i?: string; token?: string }>;
}) {
  const { post: postId, i, token } = await props.searchParams;
  if (!postId || !token || !verifyRenderToken(postId, token)) notFound();

  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: { account: true },
  });
  if (!post) notFound();

  const index = Number.parseInt(i ?? "0", 10);
  const doc = post.doc as unknown as PostDoc;
  const slide = doc.slides[index];
  if (!slide) notFound();

  const style = post.style as TemplateStyleId;
  const man = getManifest(style);
  const scale = man.canvas.width / man.base.w;

  return (
    <div
      // Exact canvas box — the worker screenshots this element.
      id="slide-canvas"
      style={{
        width: `${man.canvas.width}px`,
        height: `${man.canvas.height}px`,
        overflow: "hidden",
        position: "relative",
        background: "#000",
      }}
    >
      <div
        style={{
          width: `${man.base.w}px`,
          height: `${man.base.h}px`,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          position: "absolute",
          top: 0,
          left: 0,
        }}
      >
        <Slide
          slide={slide}
          index={index}
          total={doc.slides.length}
          ctx={{
            style,
            accent: post.account.accent,
            brand: post.account.name,
            handle: post.account.handle,
            initials: post.account.initials,
          }}
        />
      </div>
    </div>
  );
}
