/**
 * Bare layout for the export surface: no app chrome, no margin, nothing that
 * could offset the screenshot. Fonts still come from the root layout.
 */
export default function RenderLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ margin: 0, padding: 0, background: "#000", width: "fit-content" }}>{children}</div>
  );
}
