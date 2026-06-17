"use client";

import { useState, useEffect } from "react";

type Channel = { network: string; channelId: string; label?: string };

export function ScheduleModal({
  pieceId,
  brandChannels,
  onClose,
}: {
  pieceId: string;
  brandChannels: Channel[];
  onClose: () => void;
}) {
  const [channelId, setChannelId] = useState(brandChannels[0]?.channelId ?? "");
  const [network, setNetwork] = useState(brandChannels[0]?.network ?? "instagram");
  const [scheduledAt, setScheduledAt] = useState("");
  const [bestTimes, setBestTimes] = useState<Record<string, string>>({});
  const [dryRun, setDryRun] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");

  // Fetch best-time suggestions on open
  useEffect(() => {
    fetch(`/api/schedule?pieceId=${pieceId}`)
      .then((r) => r.json())
      .then((data) => {
        const map: Record<string, string> = {};
        for (const bt of data.bestTimes ?? []) {
          if (bt.bestTime) map[bt.channelId] = bt.bestTime;
        }
        setBestTimes(map);
        if (map[channelId]) setScheduledAt(map[channelId].slice(0, 16));
      })
      .catch(() => {});
  }, [pieceId, channelId]);

  // When channel changes, update network selection
  function handleChannelChange(cid: string) {
    setChannelId(cid);
    const ch = brandChannels.find((c) => c.channelId === cid);
    if (ch) setNetwork(ch.network);
    if (bestTimes[cid]) setScheduledAt(bestTimes[cid].slice(0, 16));
  }

  async function submit() {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pieceId,
          channelId,
          network,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
          dryRun,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Schedule failed");
      setResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Schedule post</h2>
          <button type="button" className="ghost sm" onClick={onClose}>✕</button>
        </div>

        {result ? (
          <div className="modal-body">
            {result.dryRun ? (
              <>
                <p className="eyebrow">Dry-run payload</p>
                <pre className="code-block">{JSON.stringify(result.payload, null, 2)}</pre>
              </>
            ) : (
              <div className="claims-summary pass">
                ✓ Post scheduled successfully
              </div>
            )}
            <button type="button" className="btn" onClick={onClose}>Close</button>
          </div>
        ) : (
          <div className="modal-body">
            <div className="field">
              <label>Channel</label>
              <select
                className="select-sm"
                value={channelId}
                onChange={(e) => handleChannelChange(e.target.value)}
              >
                {brandChannels.map((c) => (
                  <option key={c.channelId} value={c.channelId}>
                    {c.label ?? `${c.network} (${c.channelId})`}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Schedule time <span className="muted">(leave blank to publish now)</span></label>
              <input
                type="datetime-local"
                className="field input"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
              {bestTimes[channelId] && (
                <button
                  type="button"
                  className="ghost sm"
                  onClick={() => setScheduledAt(bestTimes[channelId].slice(0, 16))}
                >
                  Use suggested time
                </button>
              )}
            </div>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
              />
              Dry run (preview payload, don&apos;t publish)
            </label>

            {error && <p className="error">{error}</p>}

            <div className="modal-actions">
              <button type="button" className="ghost sm" onClick={onClose}>Cancel</button>
              <button type="button" className="btn" onClick={submit} disabled={loading}>
                {loading ? "Scheduling…" : dryRun ? "Preview payload" : scheduledAt ? "Schedule" : "Publish now"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
