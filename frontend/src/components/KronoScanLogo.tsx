export default function KronoScanLogo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="kg1" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#34d399"/>
          <stop offset="100%" stopColor="#059669"/>
        </linearGradient>
      </defs>
      {/* Outer circle */}
      <circle cx="50" cy="50" r="46" stroke="url(#kg1)" strokeWidth="3" fill="#060d0a"/>
      {/* Clock face */}
      <circle cx="50" cy="50" r="32" stroke="url(#kg1)" strokeWidth="1.5" fill="none" opacity="0.3"/>
      {/* Hour hand */}
      <line x1="50" y1="50" x2="50" y2="24" stroke="url(#kg1)" strokeWidth="3" strokeLinecap="round"/>
      {/* Minute hand */}
      <line x1="50" y1="50" x2="68" y2="58" stroke="#34d399" strokeWidth="2" strokeLinecap="round"/>
      {/* Center dot */}
      <circle cx="50" cy="50" r="3.5" fill="url(#kg1)"/>
      {/* Scan arc */}
      <path d="M50 18 A32 32 0 0 1 82 50" stroke="#34d399" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.6"/>
    </svg>
  );
}
