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
        <linearGradient id="crestA" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#14B8A6" />
          <stop offset="100%" stopColor="#0F8F78" />
        </linearGradient>
        <linearGradient id="crestB" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#22D3EE" />
          <stop offset="100%" stopColor="#1196B5" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="56" height="56" rx="16" fill="#F0FDFA" />
      <path d="M14 39c5-11 16-18 28-18 3 0 6 .4 9 1.2-5 7-10 11-16 12.8-4 1.3-8 1.7-12 4z" fill="url(#crestA)" />
      <path d="M23 24c6-7 14-10 23-9-2 6-6 10-11 12-4.5 1.6-8.8 1.8-12 .5z" fill="url(#crestB)" />
      <circle cx="37" cy="37" r="4.2" fill="#0F172A" />
      <path d="M13 45c9-4 19-4 30 0" stroke="#99F6E4" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
