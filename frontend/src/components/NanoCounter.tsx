import { useEffect, useRef, useState } from 'react';

export default function NanoCounter({ value }: { value: bigint }) {
  const [display, setDisplay] = useState(0);
  const animRef = useRef<number>(0);
  const startRef = useRef<number>(0);
  const startValRef = useRef(0);

  useEffect(() => {
    const target = Number(value);
    const start = startValRef.current;
    if (animRef.current) cancelAnimationFrame(animRef.current);
    startRef.current = 0;
    const animate = (ts: number) => {
      if (!startRef.current) startRef.current = ts;
      const progress = Math.min((ts - startRef.current) / 800, 1);
      const eased = progress * (2 - progress);
      setDisplay(start + (target - start) * eased);
      if (progress < 1) animRef.current = requestAnimationFrame(animate);
      else startValRef.current = target;
    };
    animRef.current = requestAnimationFrame(animate);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [value]);

  const formatted = (display / 1e6).toFixed(6);
  const [int, dec] = formatted.split('.');
  return (
    <span style={{ fontFamily: 'JetBrains Mono, monospace', display: 'inline-flex', alignItems: 'baseline', gap: 1 }}>
      <span style={{ fontSize: '0.8em', marginRight: 1 }}>$</span>
      <span style={{ fontWeight: 800 }}>{int}</span>
      <span style={{ opacity: 0.5 }}>.</span>
      <span style={{ fontWeight: 700 }}>{dec}</span>
    </span>
  );
}
