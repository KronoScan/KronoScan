export default function KronoScanLogo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="ksgrad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#34d399"/>
          <stop offset="100%" stopColor="#059669"/>
        </linearGradient>
      </defs>
      {/* Hexagon shape — like the original */}
      <path
        d="M20 3 L35 11.5 L35 28.5 L20 37 L5 28.5 L5 11.5 Z"
        stroke="url(#ksgrad)"
        strokeWidth="2"
        fill="rgba(16,185,129,0.08)"
      />
      {/* Inner hexagon */}
      <path
        d="M20 9 L30 14.5 L30 25.5 L20 31 L10 25.5 L10 14.5 Z"
        stroke="url(#ksgrad)"
        strokeWidth="1"
        fill="none"
        opacity="0.4"
      />
      {/* Center dot */}
      <circle cx="20" cy="20" r="3" fill="url(#ksgrad)"/>
      {/* Scan lines */}
      <line x1="14" y1="20" x2="17" y2="20" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="23" y1="20" x2="26" y2="20" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="20" y1="14" x2="20" y2="17" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="20" y1="23" x2="20" y2="26" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
