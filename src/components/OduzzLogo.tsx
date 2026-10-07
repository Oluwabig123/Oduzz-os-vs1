import React from "react";

export type OduzzLogoProps = {
  size?: number;
  variant?: "full" | "icon" | "wordmark";
  className?: string;
  glow?: boolean;
};

export const OduzzLogo: React.FC<OduzzLogoProps> = ({
  size = 36,
  variant = "full",
  className = "",
  glow = true,
}) => {
  const iconSize = size;
  const filterId = `oduzz-glow-${Math.random().toString(36).substr(2, 6)}`;
  const gradId = `oduzz-grad-${Math.random().toString(36).substr(2, 6)}`;
  const coreGradId = `oduzz-core-grad-${Math.random().toString(36).substr(2, 6)}`;

  const renderIcon = () => (
    <svg
      width={iconSize}
      height={iconSize}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        display: "inline-block",
        verticalAlign: "middle",
        flexShrink: 0,
        filter: glow ? `drop-shadow(0 0 12px rgba(99, 102, 241, 0.55))` : undefined,
      }}
      aria-label="Oduzz Logo Mark"
    >
      <defs>
        {/* Exterior High-Tech Ring Gradient */}
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="30%" stopColor="#6366f1" />
          <stop offset="70%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#ec4899" />
        </linearGradient>

        {/* Interior Energy Core Gradient */}
        <linearGradient id={coreGradId} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="50%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#ffffff" />
        </linearGradient>

        <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Background Soft Ambient Plate */}
      <circle cx="50" cy="50" r="46" fill="#0b0f19" fillOpacity="0.85" />

      {/* Outer Stylized "O" Aperture Ring with Precision Cutouts */}
      <circle
        cx="50"
        cy="50"
        r="40"
        stroke={`url(#${gradId})`}
        strokeWidth="6.5"
        strokeLinecap="round"
        strokeDasharray="200 45"
        strokeDashoffset="18"
      />

      {/* Precision Smart Node Orbitals (IoT Nodes) */}
      <circle cx="50" cy="10" r="3.5" fill="#38bdf8" />
      <circle cx="90" cy="50" r="3.5" fill="#8b5cf6" />
      <circle cx="50" cy="90" r="3.5" fill="#ec4899" />
      <circle cx="10" cy="50" r="3.5" fill="#06b6d4" />

      {/* Inner Concentric Smart Ring */}
      <circle
        cx="50"
        cy="50"
        r="27"
        stroke={`url(#${gradId})`}
        strokeWidth="3"
        strokeDasharray="95 30"
        strokeDashoffset="-25"
        opacity="0.75"
      />

      {/* Cybernetic Connectivity Cross-Bars (The Smart Hub Core) */}
      <line x1="32" y1="50" x2="42" y2="50" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="58" y1="50" x2="68" y2="50" stroke="#8b5cf6" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="50" y1="32" x2="50" y2="42" stroke="#06b6d4" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="50" y1="58" x2="50" y2="68" stroke="#ec4899" strokeWidth="2.5" strokeLinecap="round" />

      {/* Glowing Pulsing Oduzz Intelligence Center */}
      <circle
        cx="50"
        cy="50"
        r="11"
        fill={`url(#${coreGradId})`}
        filter={`url(#${filterId})`}
      />
      <circle cx="50" cy="50" r="5" fill="#ffffff" />
    </svg>
  );

  if (variant === "icon") {
    return <span className={`oduzz-logo-icon-wrapper ${className}`}>{renderIcon()}</span>;
  }

  if (variant === "wordmark") {
    return (
      <span
        className={`oduzz-wordmark ${className}`}
        style={{
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          fontWeight: 800,
          letterSpacing: "-0.5px",
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          lineHeight: 1,
        }}
      >
        <span
          style={{
            background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            fontSize: `${Math.round(size * 0.72)}px`,
            fontWeight: 850,
          }}
        >
          ODUZZ
        </span>
        <span
          style={{
            background: "linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)",
            color: "#ffffff",
            fontSize: `${Math.round(size * 0.38)}px`,
            padding: "2px 7px",
            borderRadius: "6px",
            fontWeight: 700,
            letterSpacing: "0.5px",
            boxShadow: "0 2px 8px rgba(99, 102, 241, 0.35)",
          }}
        >
          OS
        </span>
      </span>
    );
  }

  // Full Variant: Icon + Wordmark
  return (
    <span
      className={`oduzz-logo-full ${className}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: `${Math.max(8, Math.round(size * 0.28))}px`,
        textDecoration: "none",
        userSelect: "none",
      }}
    >
      {renderIcon()}
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          lineHeight: 1,
        }}
      >
        <span
          style={{
            fontSize: `${Math.round(size * 0.65)}px`,
            fontWeight: 850,
            letterSpacing: "-0.6px",
            color: "#0f172a",
          }}
          className="oduzz-brand-text"
        >
          ODUZZ
        </span>
        <span
          style={{
            background: "linear-gradient(135deg, #6366f1 0%, #315efb 100%)",
            color: "#ffffff",
            fontSize: `${Math.max(10, Math.round(size * 0.35))}px`,
            padding: "2px 6px",
            borderRadius: "6px",
            fontWeight: 700,
            letterSpacing: "0.5px",
            boxShadow: "0 2px 8px rgba(99, 102, 241, 0.35)",
          }}
        >
          OS
        </span>
      </span>
    </span>
  );
};

export default OduzzLogo;
