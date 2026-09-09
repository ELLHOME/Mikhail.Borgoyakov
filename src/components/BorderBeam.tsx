import type { ReactNode, CSSProperties } from "react";

type Size = "sm" | "md" | "lg";
type ColorVariant = "colorful" | "blue";

export type BorderBeamProps = {
  children: ReactNode;
  size?: Size;
  colorVariant?: ColorVariant;
  className?: string;
  style?: CSSProperties;
  radius?: number;
  duration?: number;
};

/**
 * BorderBeam — animated glowing border ("beam" traveling around the edge).
 * Self-contained: the visual is driven by CSS in index.css (.beam*), so there
 * is no external npm dependency. Wrap any element to give it the beam.
 */
export function BorderBeam({
  children,
  size = "md",
  colorVariant = "colorful",
  className = "",
  style,
  radius = 20,
  duration = 5,
}: BorderBeamProps) {
  const cls = [
    "beam",
    `beam--${size}`,
    colorVariant === "colorful" ? "beam--colorful" : "beam--blue",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div
      className={cls}
      style={{ ["--beam-radius" as string]: `${radius}px`, ["--beam-dur" as string]: `${duration}s`, borderRadius: radius, ...style }}
    >
      <div className="beam-inner" style={{ borderRadius: radius }}>
        {children}
      </div>
    </div>
  );
}

export default BorderBeam;
