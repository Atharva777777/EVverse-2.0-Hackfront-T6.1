import React from "react";
import Image from "next/image";

export function BrandLogo({ suffix }: { suffix?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
      <div style={{ position: "relative", width: "46px", height: "46px", flexShrink: 0 }}>
        <Image
          src="/images/evverse-logo.png"
          alt="EVverse Logo"
          width={46}
          height={46}
          priority
          style={{ objectFit: "contain", width: "100%", height: "100%" }}
        />
      </div>
      {suffix && (
        <span style={{ fontFamily: "var(--font-sans)", fontSize: "14px", fontWeight: 600, color: "var(--color-ink-2)", borderLeft: "1px solid var(--color-border-subtle)", paddingLeft: "10px" }}>
          {suffix}
        </span>
      )}
    </div>
  );
}

