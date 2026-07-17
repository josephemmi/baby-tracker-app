interface BrandMarkProps {
  size?: number;
}

// Diagonal split amber/sage square with a folded-corner (paper-color)
// triangle cut into the top-right — a callback to the paper log this app
// replaces, styled as a "folded sticky note."
export function BrandMark({ size = 40 }: BrandMarkProps) {
  return (
    <div
      className="relative shrink-0 overflow-hidden"
      style={{ width: size, height: size, borderRadius: size * 0.225 }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        aria-hidden="true"
        className="block"
      >
        <polygon points="0,0 40,0 0,40" className="fill-amber" />
        <polygon points="40,0 40,40 0,40" className="fill-sage" />
        <polygon points="30,0 40,0 40,10" className="fill-paper" />
      </svg>
    </div>
  );
}
