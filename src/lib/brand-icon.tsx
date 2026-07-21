// Renders the BrandMark's diagonal amber/sage split with folded-corner cut
// as raw SVG, for use inside next/og's ImageResponse (icon.tsx, apple-icon.tsx,
// and the manifest icon routes) — kept separate from the component version
// (src/components/brand/brand-mark.tsx) since ImageResponse can't render
// arbitrary React components, only a constrained subset of HTML/SVG.
export function brandMarkSvg(size: number, { padding = 0 } = {}) {
  const inner = size - padding * 2;
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#FBF7EC",
      }}
    >
      <svg width={inner} height={inner} viewBox="0 0 40 40">
        <polygon points="0,0 40,0 0,40" fill="#C98A2E" />
        <polygon points="40,0 40,40 0,40" fill="#4F7566" />
        <polygon points="30,0 40,0 40,10" fill="#FBF7EC" />
      </svg>
    </div>
  );
}
