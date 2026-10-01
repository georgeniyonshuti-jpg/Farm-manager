type Props = {
  size?: number;
  className?: string;
};

/** Prefer the high-res PNG (1024²) over the SVG wrapper for crisp small sizes. */
export function BrandLogo({ size = 36, className = "" }: Props) {
  const px = Math.max(1, Math.round(size));
  return (
    <img
      src="/logo.png"
      alt="Clevafarm logo"
      width={px}
      height={px}
      className={["object-contain", className].join(" ").trim()}
      style={{ imageRendering: "auto" }}
      loading="eager"
      decoding="async"
      draggable={false}
    />
  );
}
