"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";

type Pillar = { id: string; name: string; description: string };
type Brand = {
  id: string;
  name: string;
  locale: string;
  publisher: string;
  pillars: Pillar[];
  brandKit: { defaultSkin: string } | null;
};
type Idea = {
  id: string;
  title: string;
  angle: string;
  recommendedFormat: string;
};

export function IdeateClient({
  brands,
  defaultBrandId,
  initialIdeas = [],
}: {
  brands: Brand[];
  defaultBrandId?: string;
  initialIdeas?: Idea[];
}) {
  const router = useRouter();
  const [brandId, setBrandId] = useState(defaultBrandId ?? brands[0]?.id ?? "");
  const [pillarId, setPillarId] = useState<string | undefined>();
  const [brief, setBrief] = useState("");
  const [count, setCount] = useState(5);
  const [ideas, setIdeas] = useState<Idea[]>(initialIdeas);
  const [loading, setLoading] = useState(false);
  const [drafting, setDrafting] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadIdeasForBrand = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/ideas?brandId=${id}`);
      if (res.ok) {
        const data = await res.json();
        setIdeas(data.ideas);
      }
    } catch {
      // non-critical — silently ignore
    }
  }, []);

  const selectedBrand = brands.find((b) => b.id === brandId);

  async function suggestIdeas() {
    setError("");
    setLoading(true);
    setIdeas([]);
    try {
      const res = await fetch("/api/ideas/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, pillarId, brief: brief || undefined, count }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setIdeas(data.ideas);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function draftFromIdea(ideaId: string) {
    setDrafting(ideaId);
    try {
      const res = await fetch("/api/pieces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ideaId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Draft failed");
      router.push(`/pieces/${data.piece.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Draft failed");
      setDrafting(null);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Ideate</h1>
      </div>

      {/* Brand selector */}
      <section className="section">
        <p className="eyebrow">Brand</p>
        <div className="brand-picker">
          {brands.map((b) => (
            <button
              key={b.id}
              type="button"
              className={`brand-card ${b.id === brandId ? "selected" : ""}`}
              onClick={() => {
                setBrandId(b.id);
                setPillarId(undefined);
                loadIdeasForBrand(b.id);
              }}
            >
              <span className="brand-card-name">{b.name}</span>
              <span className="muted">
                {b.locale === "pt_BR" ? "pt-BR" : "EN"} · {b.publisher}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Pillar selector */}
      {selectedBrand && (
        <section className="section">
          <p className="eyebrow">Content pillar <span className="muted">(optional)</span></p>
          <div className="pill-group">
            <button
              type="button"
              className={`pill ${!pillarId ? "active" : ""}`}
              onClick={() => setPillarId(undefined)}
            >
              Any pillar
            </button>
            {selectedBrand.pillars.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`pill ${p.id === pillarId ? "active" : ""}`}
                onClick={() => setPillarId(p.id === pillarId ? undefined : p.id)}
                title={p.description}
              >
                {p.name}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Optional brief */}
      <section className="section">
        <p className="eyebrow">Brief <span className="muted">(optional)</span></p>
        <textarea
          className="textarea"
          placeholder="Any specific angle, hook, or topic to focus on…"
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={2}
        />
      </section>

      {/* Count + generate */}
      <div className="ideate-actions">
        <label className="count-label">
          <span className="muted">Ideas</span>
          <select
            className="select-sm"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          >
            {[3, 5, 8].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn"
          onClick={suggestIdeas}
          disabled={!brandId || loading}
        >
          {loading ? "Generating…" : "Suggest ideas"}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {/* Ideas list */}
      {ideas.length > 0 && (
        <section className="section">
          <p className="eyebrow">Ideas</p>
          <div className="ideas-list">
            {ideas.map((idea) => (
              <div key={idea.id} className="idea-card">
                <div className="idea-meta">
                  <span className="badge badge-format">{idea.recommendedFormat}</span>
                </div>
                <h3 className="idea-title">{idea.title}</h3>
                <p className="idea-angle muted">{idea.angle}</p>
                <button
                  type="button"
                  className="btn sm"
                  disabled={drafting === idea.id}
                  onClick={() => draftFromIdea(idea.id)}
                >
                  {drafting === idea.id ? "Drafting…" : "Draft this →"}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
