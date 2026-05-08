"use client";

/**
 * Lightweight SVG sparkline.
 *
 * Pure SVG so it ships in a few KB and renders inside the doctor-
 * app's offline cache without any chart library. Used on the
 * vitals trend card; could be reused for any time-series the
 * platform surfaces (revenue, queue load, etc.).
 *
 * Conventions:
 *   - Horizontally scaled to fill the container (preserveAspectRatio="none")
 *   - Padding inside the viewBox so the line never touches the edge
 *   - Last point gets a filled dot so the eye lands on "current"
 *   - When fewer than 2 points exist, we render a flat line at the
 *     single value so the card still looks alive
 */
import React from "react";

interface SparklineProps {
  /** Time-ordered values (oldest → newest). Nulls are treated as
   *  gaps and skipped; the line continues from the previous point. */
  values: Array<number | null>;
  /** Color of the line. Tailwind tokens or hex. */
  color?: string;
  /** Color of the trailing dot (defaults to `color`). */
  dotColor?: string;
  /** Pixel dimensions of the container; SVG fills it. */
  width?: number;
  height?: number;
  /** Show a faint baseline at min value. Useful for vitals to
   *  emphasize the floor. */
  showBaseline?: boolean;
  className?: string;
  ariaLabel?: string;
}

export function Sparkline({
  values,
  color = "#0d9488",       // teal-600
  dotColor,
  width = 120,
  height = 28,
  showBaseline = false,
  className,
  ariaLabel,
}: SparklineProps) {
  const cleaned = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (cleaned.length === 0) {
    return (
      <svg className={className} width={width} height={height} aria-hidden="true" />
    );
  }
  const min = Math.min(...cleaned);
  const max = Math.max(...cleaned);
  const span = max - min || 1; // avoid div-by-zero on flat series

  const padX = 2;
  const padY = 4;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  // Build the path. We treat nulls as gaps by emitting a fresh "M"
  // when we resume. Each non-null point gets an L command.
  const stepX = values.length > 1 ? innerW / (values.length - 1) : innerW;
  let path = "";
  let prevDrawn = false;
  values.forEach((v, i) => {
    if (typeof v !== "number" || !Number.isFinite(v)) {
      prevDrawn = false;
      return;
    }
    const x = padX + i * stepX;
    const y = padY + innerH - ((v - min) / span) * innerH;
    path += (prevDrawn ? "L" : "M") + x.toFixed(2) + "," + y.toFixed(2);
    prevDrawn = true;
  });

  // Last point + value (for the trailing dot).
  const lastIdx = values.findLastIndex?.((v) => typeof v === "number" && Number.isFinite(v))
    ?? (() => {
      // findLastIndex polyfill — Next.js targets ES2017.
      for (let i = values.length - 1; i >= 0; i--) {
        const v = values[i];
        if (typeof v === "number" && Number.isFinite(v)) return i;
      }
      return -1;
    })();
  const lastX = padX + lastIdx * stepX;
  const lastVal = values[lastIdx] as number;
  const lastY = padY + innerH - ((lastVal - min) / span) * innerH;

  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel || `Trend with ${cleaned.length} values`}
    >
      {showBaseline && (
        <line
          x1={padX}
          y1={padY + innerH}
          x2={padX + innerW}
          y2={padY + innerH}
          stroke="#e7e5e4"
          strokeWidth={1}
        />
      )}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r={2} fill={dotColor ?? color} />
    </svg>
  );
}
