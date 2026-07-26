"use client";

import { Icon } from "@/components/ui/Icon";
import { getManifest } from "@/lib/templates/manifests";
import type {
  ImageValue,
  PairItem,
  QuizOption,
  SlideDoc,
  Slot,
  SlotValue,
  TemplateStyleId,
} from "@/lib/templates/types";
import { isImageValue, isPairItems, isQuizOptions, isStringList } from "@/lib/templates/types";
import { textArea, textInput } from "./styles";

/**
 * The Slots tab — a form generated from the active slide's manifest entry.
 * Character counters turn red past budget; the cover additionally offers a
 * layout swap that keeps the rest of the deck intact.
 */

function counterStyle(over: boolean) {
  return {
    fontFamily: "var(--font-mono)",
    fontSize: "10.5px",
    color: over ? "#b4574f" : "var(--muted)",
    fontWeight: over ? 700 : 400,
  } as const;
}

function Label({ slot, value }: { slot: Slot; value: SlotValue }) {
  const text = typeof value === "string" ? value : "";
  const showCounter = slot.max > 0 && (slot.type === "text" || slot.type === "area");
  const over = showCounter && text.length > slot.max;

  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px", marginBottom: "6px" }}>
      <span style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--ink)" }}>
        {slot.label}
        {slot.required ? <span style={{ color: "var(--brass)" }}> *</span> : null}
      </span>
      {showCounter ? (
        <span style={counterStyle(over)}>
          {text.length}/{slot.max}
        </span>
      ) : null}
    </div>
  );
}

export function SlotEditor({
  style,
  slide,
  isCover,
  onChange,
  onSwapArchetype,
  onOpenPicker,
}: {
  style: TemplateStyleId;
  slide: SlideDoc;
  isCover: boolean;
  onChange: (slotId: string, value: SlotValue) => void;
  onSwapArchetype: (kind: string) => void;
  onOpenPicker: (slotId: string) => void;
}) {
  const man = getManifest(style);
  const kind = man.kinds[slide.kind];
  if (!kind) return null;

  const swapOptions = isCover ? man.cover : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {swapOptions.length > 1 ? (
        <div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "10.5px",
              letterSpacing: ".12em",
              textTransform: "uppercase",
              color: "var(--brass)",
              marginBottom: "9px",
            }}
          >
            Cover layout
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "7px" }}>
            {swapOptions.map((k) => {
              const on = k === slide.kind;
              return (
                <button
                  key={k}
                  onClick={() => onSwapArchetype(k)}
                  style={{
                    padding: "7px 12px",
                    borderRadius: "999px",
                    fontSize: "12.5px",
                    fontWeight: 600,
                    cursor: "pointer",
                    border: `1px solid ${on ? "transparent" : "var(--border)"}`,
                    background: on ? "var(--slate)" : "var(--surface)",
                    color: on ? "#fff" : "var(--ink)",
                  }}
                >
                  {man.kinds[k].name}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
        {kind.slots.map((slot) => {
          const value = slide.f[slot.id];

          if (slot.type === "image") {
            const image = isImageValue(value) ? (value as ImageValue) : null;
            return (
              <div key={slot.id}>
                <Label slot={slot} value={value} />
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "12px",
                    padding: "10px",
                  }}
                >
                  <div
                    style={{
                      width: "52px",
                      height: "52px",
                      borderRadius: "9px",
                      flexShrink: 0,
                      overflow: "hidden",
                      border: "1px solid var(--border)",
                      background: image?.url
                        ? `url(${image.url}) center/cover`
                        : image?.tint ?? "linear-gradient(150deg,var(--surface-2),#e5ddc6)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--muted)",
                    }}
                  >
                    {!image ? <Icon name="image" size={18} /> : null}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontSize: "13px",
                        fontWeight: 600,
                        color: image ? "var(--ink)" : "var(--muted)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {image?.name ?? "No image yet"}
                    </div>
                    <div style={{ display: "flex", gap: "8px", marginTop: "7px" }}>
                      <button
                        className="hover-slate"
                        onClick={() => onOpenPicker(slot.id)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                          background: "var(--surface-2)",
                          border: "1px solid var(--border)",
                          borderRadius: "8px",
                          padding: "6px 10px",
                          fontSize: "12px",
                          fontWeight: 600,
                          color: "var(--slate)",
                          cursor: "pointer",
                        }}
                      >
                        <Icon name="image" size={14} strokeWidth={2.4} />
                        Library
                      </button>
                      <button
                        className="hover-accent"
                        onClick={() => onOpenPicker(slot.id)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                          background: "var(--surface-2)",
                          border: "1px solid var(--border)",
                          borderRadius: "8px",
                          padding: "6px 10px",
                          fontSize: "12px",
                          fontWeight: 600,
                          color: "var(--moss)",
                          cursor: "pointer",
                        }}
                      >
                        <Icon name="wand" size={14} strokeWidth={2.4} />
                        Generate
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          if (slot.type === "pair" || slot.type === "quiz" || slot.type === "list") {
            const items: (PairItem | QuizOption | string)[] = isPairItems(value)
              ? value
              : isQuizOptions(value)
                ? value
                : isStringList(value)
                  ? value
                  : [];
            const canAdd = items.length < (slot.maxItems ?? 4);
            const canRemove = items.length > (slot.min ?? 1);

            return (
              <div key={slot.id}>
                <Label slot={slot} value={value} />
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {items.map((item, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                      {slot.type === "quiz" ? (
                        <button
                          title="Mark correct"
                          onClick={() => {
                            const next = (items as QuizOption[]).map((o, j) => ({ ...o, correct: j === i }));
                            onChange(slot.id, next);
                          }}
                          style={{
                            width: "26px",
                            height: "26px",
                            flexShrink: 0,
                            borderRadius: "50%",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: (item as QuizOption).correct ? "var(--accent)" : "transparent",
                            border: (item as QuizOption).correct ? "none" : "1.5px solid var(--border-2)",
                            color: "#f4efe0",
                          }}
                        >
                          {(item as QuizOption).correct ? <Icon name="check" size={13} strokeWidth={3} /> : null}
                        </button>
                      ) : null}

                      <div style={{ flex: 1, display: "flex", gap: "6px" }}>
                        {slot.type === "pair" ? (
                          <>
                            <input
                              value={(item as PairItem).lead}
                              placeholder="Lead"
                              onChange={(e) => {
                                const next = (items as PairItem[]).map((it, j) =>
                                  j === i ? { ...it, lead: e.target.value } : it,
                                );
                                onChange(slot.id, next);
                              }}
                              style={{ ...textInput, flex: 1, fontSize: "12.5px", padding: "8px 11px" }}
                            />
                            <input
                              value={(item as PairItem).detail}
                              placeholder="Detail"
                              onChange={(e) => {
                                const next = (items as PairItem[]).map((it, j) =>
                                  j === i ? { ...it, detail: e.target.value } : it,
                                );
                                onChange(slot.id, next);
                              }}
                              style={{ ...textInput, flex: 1.2, fontSize: "12.5px", padding: "8px 11px" }}
                            />
                          </>
                        ) : slot.type === "quiz" ? (
                          <input
                            value={(item as QuizOption).t}
                            placeholder="Answer"
                            onChange={(e) => {
                              const next = (items as QuizOption[]).map((o, j) =>
                                j === i ? { ...o, t: e.target.value } : o,
                              );
                              onChange(slot.id, next);
                            }}
                            style={{ ...textInput, flex: 1, fontSize: "12.5px", padding: "8px 11px" }}
                          />
                        ) : (
                          <input
                            value={item as string}
                            placeholder="Line"
                            onChange={(e) => {
                              const next = (items as string[]).map((s, j) => (j === i ? e.target.value : s));
                              onChange(slot.id, next);
                            }}
                            style={{ ...textInput, flex: 1, fontSize: "12.5px", padding: "8px 11px" }}
                          />
                        )}
                      </div>

                      {canRemove ? (
                        <button
                          className="hover-danger"
                          onClick={() => onChange(slot.id, items.filter((_, j) => j !== i) as SlotValue)}
                          style={{
                            width: "28px",
                            height: "28px",
                            flexShrink: 0,
                            borderRadius: "7px",
                            border: "1px solid var(--border)",
                            background: "transparent",
                            color: "var(--muted)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                          }}
                        >
                          <Icon name="close" size={14} strokeWidth={2.6} />
                        </button>
                      ) : null}
                    </div>
                  ))}

                  {canAdd ? (
                    <button
                      className="hover-surface"
                      onClick={() => {
                        const next =
                          slot.type === "pair"
                            ? [...(items as PairItem[]), { lead: "", detail: "" }]
                            : slot.type === "quiz"
                              ? [...(items as QuizOption[]), { t: "", correct: false }]
                              : [...(items as string[]), ""];
                        onChange(slot.id, next as SlotValue);
                      }}
                      style={{
                        alignSelf: "flex-start",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        background: "transparent",
                        border: "1px dashed var(--border-2)",
                        borderRadius: "8px",
                        padding: "7px 12px",
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "var(--slate)",
                        cursor: "pointer",
                      }}
                    >
                      <Icon name="plus" size={13} strokeWidth={2.8} />
                      Add item
                    </button>
                  ) : null}
                </div>
              </div>
            );
          }

          // text / area
          const text = typeof value === "string" ? value : "";
          const over = slot.max > 0 && text.length > slot.max;
          const border = over ? "#b4574f" : "var(--border)";

          return (
            <div key={slot.id}>
              <Label slot={slot} value={value} />
              {slot.type === "area" ? (
                <textarea
                  value={text}
                  rows={slot.max > 120 ? 4 : 3}
                  onChange={(e) => onChange(slot.id, e.target.value)}
                  style={{ ...textArea, borderColor: border }}
                />
              ) : (
                <input
                  value={text}
                  onChange={(e) => onChange(slot.id, e.target.value)}
                  style={{ ...textInput, borderColor: border }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
