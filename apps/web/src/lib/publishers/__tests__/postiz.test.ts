import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    postizApiKey: () => "test-key",
    postizBaseUrl: () => "https://postiz.example.com/api",
  },
}));

import { PostizPublisher } from "@/lib/publishers/postiz";
import type { ScheduleOptions } from "@/lib/publishers/types";

const baseOpts: ScheduleOptions = {
  caption: "Peak then fade.",
  hashtags: ["GLP1", "foodnoise"],
  mediaUrls: ["https://cdn.example.com/a.png", "https://cdn.example.com/b.png"],
  format: "carousel",
  scheduledAt: new Date("2026-07-22T13:00:00.000Z"),
  channelId: "integration-123",
  network: "instagram",
  idempotencyKey: "idem-1",
};

function mockFetchSequence() {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    if (url.endsWith("/upload-from-url")) {
      const uploaded = JSON.parse(init.body as string).url as string;
      const id = uploaded.includes("a.png") ? "up-a" : "up-b";
      return new Response(JSON.stringify({ id, path: uploaded }), { status: 200 });
    }
    if (url.endsWith("/posts")) {
      return new Response(JSON.stringify({ id: "post-999" }), { status: 200 });
    }
    return new Response("{}", { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

describe("PostizPublisher", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("uploads each media url, then creates a scheduled post referencing the upload ids", async () => {
    const { calls, fetchMock } = mockFetchSequence();
    const pub = new PostizPublisher();

    const result = await pub.schedule(baseOpts);

    // 2 uploads + 1 create post
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(calls[0].url).toBe("https://postiz.example.com/api/public/v1/upload-from-url");
    expect(calls[2].url).toBe("https://postiz.example.com/api/public/v1/posts");

    // Raw API key in Authorization header, no Bearer prefix
    expect((calls[2].init.headers as Record<string, string>).Authorization).toBe("test-key");

    const postBody = JSON.parse(calls[2].init.body as string);
    expect(postBody.type).toBe("schedule");
    expect(postBody.date).toBe("2026-07-22T13:00:00.000Z");
    expect(postBody.posts).toHaveLength(1);
    expect(postBody.posts[0].integration.id).toBe("integration-123");
    expect(postBody.posts[0].value[0].image).toEqual([{ id: "up-a" }, { id: "up-b" }]);
    // caption + hashtags composed
    expect(postBody.posts[0].value[0].content).toContain("Peak then fade.");
    expect(postBody.posts[0].value[0].content).toContain("#GLP1");
    expect(postBody.posts[0].settings.post_type).toBe("post");

    expect(result.providerPostId).toBe("post-999");
  });

  it("publishNow sends type=now with a current date", async () => {
    const { calls } = mockFetchSequence();
    const pub = new PostizPublisher();
    const { scheduledAt: _omit, ...nowOpts } = baseOpts;

    await pub.publishNow(nowOpts);

    const postBody = JSON.parse(calls[2].init.body as string);
    expect(postBody.type).toBe("now");
    expect(typeof postBody.date).toBe("string");
  });

  it("stories carry no caption/hashtags and signal post_type=story", async () => {
    const { calls } = mockFetchSequence();
    const pub = new PostizPublisher();

    await pub.schedule({ ...baseOpts, format: "story", firstComment: "come say hi" });

    const postBody = JSON.parse(calls[2].init.body as string);
    expect(postBody.posts[0].value[0].content).toBe("");
    expect(postBody.posts[0].settings.post_type).toBe("story");
    // first comment is dropped for stories
    expect(postBody.posts[0].settings.__comment).toBeUndefined();
  });

  it("dryRun builds the payload without hitting the network", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const pub = new PostizPublisher();

    const payload = await pub.dryRun(baseOpts);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(payload.provider).toBe("postiz");
    const posts = payload.posts as Array<{ value: Array<{ image: Array<{ id: string }> }> }>;
    expect(posts[0].value[0].image).toEqual([
      { id: "https://cdn.example.com/a.png" },
      { id: "https://cdn.example.com/b.png" },
    ]);
  });
});
