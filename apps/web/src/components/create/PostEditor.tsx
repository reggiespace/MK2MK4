"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { getManifest } from "@/lib/templates/manifests";
import type { PostDoc, TemplateStyleId } from "@/lib/templates/types";
import { textArea, textInput } from "./styles";

/**
 * The Post tab — caption, first comment and hashtags. Stories swap this for the
 * link sticker and mention, since a story carries no caption.
 *
 * The download CTA belongs here, never on a slide.
 */
export function PostEditor({
  style,
  doc,
  onChange,
}: {
  style: TemplateStyleId;
  doc: PostDoc;
  onChange: (patch: Partial<PostDoc>) => void;
}) {
  const man = getManifest(style);
  const [newTag, setNewTag] = useState("");

  function addTag() {
    const cleaned = newTag.trim().replace(/[#\s]+/g, "");
    if (!cleaned) return;
    const tag = `#${cleaned}`;
    if (doc.hashtags.some((t) => t.toLowerCase() === tag.toLowerCase())) {
      setNewTag("");
      return;
    }
    onChange({ hashtags: [...doc.hashtags, tag] });
    setNewTag("");
  }

  if (man.noCaption) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "12px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            padding: "13px 15px",
          }}
        >
          <span style={{ display: "flex", color: "var(--brass)", marginTop: "1px" }}>
            <Icon name="info" size={15} strokeWidth={2.4} />
          </span>
          <div style={{ fontSize: "12.5px", color: "var(--muted)", lineHeight: 1.5 }}>
            Stories carry no caption — the download link rides the link sticker or your bio.
          </div>
        </div>
        <div>
          <div style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--ink)", marginBottom: "6px" }}>
            Link sticker URL
          </div>
          <input
            value={doc.linkSticker}
            onChange={(e) => onChange({ linkSticker: e.target.value })}
            placeholder="https://…"
            style={{ ...textInput, fontFamily: "var(--font-mono)", fontSize: "12.5px" }}
          />
        </div>
        <div>
          <div style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--ink)", marginBottom: "6px" }}>
            Mention / collab tag
          </div>
          <input
            value={doc.mention}
            onChange={(e) => onChange({ mention: e.target.value })}
            placeholder="@handle"
            style={{ ...textInput, fontSize: "13px" }}
          />
        </div>
      </div>
    );
  }

  const captionMax = man.postDelivery.caption?.max ?? 2200;
  const captionOver = doc.caption.length > captionMax;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "6px" }}>
          <span style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--ink)" }}>Caption</span>
          <span
            style={{
              fontSize: "11.5px",
              color: captionOver ? "#b4574f" : "var(--muted)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {doc.caption.length}/{captionMax}
          </span>
        </div>
        <textarea
          value={doc.caption}
          rows={6}
          onChange={(e) => onChange({ caption: e.target.value })}
          style={{ ...textArea, borderColor: captionOver ? "#b4574f" : "var(--border)" }}
        />
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "8px" }}>
          <span style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--ink)" }}>First comment</span>
          <span style={{ fontSize: "11px", color: "var(--muted)" }}>
            Auto-posts on publish · carries the download link
          </span>
        </div>
        <textarea
          value={doc.first}
          rows={3}
          onChange={(e) => onChange({ first: e.target.value })}
          style={textArea}
        />
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "9px" }}>
          <span style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--ink)" }}>Hashtags</span>
          <span style={{ fontSize: "11.5px", color: "var(--muted)" }}>· {doc.hashtags.length}</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "7px", alignItems: "center" }}>
          {doc.hashtags.map((tag) => (
            <span
              key={tag}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                fontFamily: "var(--font-mono)",
                fontSize: "12px",
                color: "var(--slate)",
                background: "#e0eaf4",
                padding: "5px 6px 5px 11px",
                borderRadius: "999px",
              }}
            >
              {tag}
              <button
                onClick={() => onChange({ hashtags: doc.hashtags.filter((t) => t !== tag) })}
                aria-label={`Remove ${tag}`}
                style={{
                  display: "flex",
                  cursor: "pointer",
                  color: "var(--slate)",
                  opacity: 0.65,
                  border: "none",
                  background: "transparent",
                  borderRadius: "999px",
                  width: "16px",
                  height: "16px",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 0,
                }}
              >
                <Icon name="close" size={11} strokeWidth={3} />
              </button>
            </span>
          ))}
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              background: "#fff",
              border: "1px dashed var(--border-2)",
              borderRadius: "999px",
              padding: "3px 4px 3px 11px",
            }}
          >
            <input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag();
                }
              }}
              placeholder="add tag"
              style={{
                border: "none",
                background: "transparent",
                outline: "none",
                fontFamily: "var(--font-mono)",
                fontSize: "12px",
                color: "var(--ink)",
                width: "70px",
              }}
            />
            <button
              onClick={addTag}
              aria-label="Add hashtag"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "22px",
                height: "22px",
                borderRadius: "999px",
                border: "none",
                background: "var(--accent)",
                color: "#f4efe0",
                cursor: "pointer",
                padding: 0,
              }}
            >
              <Icon name="plus" size={13} strokeWidth={2.8} />
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
