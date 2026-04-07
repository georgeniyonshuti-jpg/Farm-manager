type Props = {
  size?: number;
  className?: string;
};

export function BrandLogo({ size = 36, className = "" }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Clevafarm logo"
      className={className}
    >
      <defs>
        <linearGradient id="leafA" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8BCF3F" />
          <stop offset="100%" stopColor="#1B8D2E" />
        </linearGradient>
        <linearGradient id="fieldA" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#84C430" />
          <stop offset="100%" stopColor="#2B9B37" />
        </linearGradient>
      </defs>
      <path d="M10 30c4-12 18-20 33-18-7 6-10 10-12 15-4-1-8 0-11 3z" fill="url(#leafA)" />
      <path d="M33 14c8-6 16-6 21-3-4 7-9 10-17 10-2-2-3-4-4-7z" fill="url(#leafA)" />
      <circle cx="36" cy="36" r="7" fill="#F4C316" />
      <path d="M8 42c8-9 18-12 30-8 8 3 14 3 20 1-6 8-14 13-26 14-11 1-18-2-24-7z" fill="url(#fieldA)" />
      <path d="M10 41c8-6 17-7 26-5M13 45c8-5 16-6 24-4M18 48c7-4 13-5 20-4" stroke="#CBEA86" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}
