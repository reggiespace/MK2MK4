import { prisma } from "@/lib/db";
import { integrationStatus } from "@/lib/env";

export default async function SettingsPage() {
  const [brands, status] = await Promise.all([
    prisma.brand.findMany({
      orderBy: { key: "asc" },
      include: {
        brandKit: true,
        pillars: { orderBy: { name: "asc" } },
        _count: { select: { pieces: true } },
      },
    }),
    Promise.resolve(integrationStatus()),
  ]);

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
      </div>

      <section className="section">
        <p className="eyebrow">API Integrations</p>
        <div className="settings-grid">
          {Object.entries(status).map(([key, ok]) => (
            <div key={key} className="settings-row">
              <span className={`dot ${ok ? "ok" : "off"}`} />
              <div>
                <strong>{key}</strong>
                <p className="muted">{ok ? "Configured" : "Set env var to enable"}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {brands.map((brand) => (
        <section key={brand.id} className="section">
          <p className="eyebrow">{brand.name}</p>
          <div className="card">
            <div className="brand-details">
              <div>
                <strong>Locale</strong>
                <p className="muted">{brand.locale === "pt_BR" ? "Português (BR)" : "English"}</p>
              </div>
              <div>
                <strong>Publisher</strong>
                <p className="muted">{brand.publisher}</p>
              </div>
              <div>
                <strong>Default skin</strong>
                <p className="muted">{brand.brandKit?.defaultSkin ?? "—"}</p>
              </div>
              <div>
                <strong>ElevenLabs voice</strong>
                <p className="muted">{brand.brandKit?.voiceId ?? "—"}</p>
              </div>
            </div>

            <p className="eyebrow" style={{ marginTop: "1rem" }}>Content pillars</p>
            <ul className="pillars-list">
              {brand.pillars.map((p) => (
                <li key={p.id}>
                  <strong>{p.name}</strong>
                  <p className="muted">{p.description}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}
    </div>
  );
}
