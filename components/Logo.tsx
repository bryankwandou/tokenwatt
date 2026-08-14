/**
 * TokenWatt mark.
 *
 * A meter dial that is three-quarters swept, with the needle replaced by a
 * bolt: the dial says "measurement", the bolt says "consumption". The gap in
 * the arc sits at the bottom, the way an analogue gauge leaves its scale open.
 */
export function Logo({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      role="img"
      aria-label="TokenWatt"
      className={className}
    >
      <defs>
        <linearGradient id="tw-arc" x1="8" y1="6" x2="40" y2="42" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F7C15C" />
          <stop offset="0.55" stopColor="#F2A63A" />
          <stop offset="1" stopColor="#B9711B" />
        </linearGradient>
        <linearGradient id="tw-bolt" x1="20" y1="10" x2="30" y2="38" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFF0D2" />
          <stop offset="1" stopColor="#F2A63A" />
        </linearGradient>
      </defs>

      {/* Outer dial, open at the base. */}
      <path
        d="M12.9 39.1a20 20 0 1 1 22.2 0"
        stroke="url(#tw-arc)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      {/* Inner tick arc — the graduated scale. */}
      <path
        d="M18.6 32.8a12 12 0 1 1 10.8 0"
        stroke="#F2A63A"
        strokeOpacity="0.28"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="1.5 4"
      />
      {/* Needle as a bolt. */}
      <path
        d="M26.4 12.5 18 26.2h5.1l-1.6 9.4 8.6-14.1h-5.2l1.5-9z"
        fill="url(#tw-bolt)"
      />
    </svg>
  );
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <Logo size={28} />
      <span className="text-[17px] font-semibold tracking-tight">
        Token<span className="text-watt">Watt</span>
      </span>
    </span>
  );
}
