"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadAssetAction } from "@/app/actions/assets";
import { MAX_UPLOAD_BYTES, UPLOADABLE_KINDS, UPLOAD_ACCEPT } from "@/lib/upload";
import { mono, primaryButton } from "@/components/create/styles";

/**
 * Upload control for the Assets library.
 *
 * The file input stays hidden and is driven by the button, so the control keeps
 * the design's pill shape instead of the browser's default file widget. The
 * kind select sits beside it because filing matters: only assets filed under
 * Logo can be picked as a brand mark.
 */

const LABELS: Record<string, string> = { photo: "Photo", screen: "Screenshot", logo: "Logo" };

export function UploadButton({ accountId }: { accountId: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [kind, setKind] = useState<string>("photo");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function reset() {
    // Clear the input so re-picking the same file still fires `change`.
    if (input.current) input.current.value = "";
  }

  function onPick(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setError(null);

    // Check the ceiling here too: past the body limit the request is rejected
    // before the action runs, which surfaces as a network error rather than the
    // readable message the action would have returned.
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`That file is ${(file.size / 1024 / 1024).toFixed(1)}MB — the limit is 8MB.`);
      reset();
      return;
    }

    const form = new FormData();
    form.set("file", file);
    form.set("kind", kind);
    // A logo belongs to one brand; general imagery is reusable workspace-wide.
    if (accountId && kind === "logo") form.set("accountId", accountId);

    start(async () => {
      const res = await uploadAssetAction(form);
      if (!res.ok) setError(res.error);
      else router.refresh();
      reset();
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "flex-end" }}>
      <div style={{ display: "flex", gap: "9px", alignItems: "center" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "7px" }}>
          <span style={mono(10, { color: "var(--muted)" })}>File as</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            style={{
              border: "1px solid var(--border)",
              borderRadius: "10px",
              padding: "9px 11px",
              background: "var(--surface)",
              fontSize: "13px",
              color: "var(--ink)",
              outline: "none",
            }}
          >
            {UPLOADABLE_KINDS.map((k) => (
              <option key={k} value={k}>
                {LABELS[k]}
              </option>
            ))}
          </select>
        </label>

        <input
          ref={input}
          type="file"
          accept={UPLOAD_ACCEPT}
          onChange={(e) => onPick(e.target.files)}
          style={{ display: "none" }}
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => input.current?.click()}
          style={{ ...primaryButton, padding: "11px 20px", fontSize: "14px", opacity: pending ? 0.6 : 1 }}
        >
          {pending ? "Uploading…" : "Upload"}
        </button>
      </div>

      {error ? (
        <div style={{ fontSize: "12px", color: "var(--danger-fg)", maxWidth: "320px", textAlign: "right" }}>
          {error}
        </div>
      ) : null}
    </div>
  );
}
