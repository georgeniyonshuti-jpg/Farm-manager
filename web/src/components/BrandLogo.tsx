type Props = {
  size?: number;
  className?: string;
};

export function BrandLogo({ size = 36, className = "" }: Props) {
  return (
    <img
      src="/logo.svg"
      alt="Clevafarm logo"
      width={size}
      height={size}
      className={["object-contain", className].join(" ").trim()}
      loading="eager"
      decoding="async"
    />
  );
}
