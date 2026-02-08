/**
 * Professional crosshair reticle - colored lines with black outline for visibility
 * against bright camera backgrounds.
 */
export function CrosshairReticle({
  color,
  strokeWidth = 2
}: {
  color: string
  strokeWidth?: number
}) {
  // Outline is always 2px thicker than the foreground
  const outlineWidth = strokeWidth + 2
  // Center dot scales with stroke width
  const dotRadius = strokeWidth + 1
  const outlineDotRadius = dotRadius + 2

  return (
    <svg viewBox="0 0 100 100" className="w-20 h-20">
      {/* Black outline/shadow layer for visibility against bright backgrounds */}
      <line x1="0" y1="50" x2="35" y2="50" stroke="black" strokeWidth={outlineWidth} />
      <line x1="65" y1="50" x2="100" y2="50" stroke="black" strokeWidth={outlineWidth} />
      <line x1="50" y1="0" x2="50" y2="35" stroke="black" strokeWidth={outlineWidth} />
      <line x1="50" y1="65" x2="50" y2="100" stroke="black" strokeWidth={outlineWidth} />
      <circle cx="50" cy="50" r={outlineDotRadius} fill="black" />

      {/* Colored foreground layer */}
      <line x1="0" y1="50" x2="35" y2="50" stroke={color} strokeWidth={strokeWidth} />
      <line x1="65" y1="50" x2="100" y2="50" stroke={color} strokeWidth={strokeWidth} />
      <line x1="50" y1="0" x2="50" y2="35" stroke={color} strokeWidth={strokeWidth} />
      <line x1="50" y1="65" x2="50" y2="100" stroke={color} strokeWidth={strokeWidth} />
      <circle cx="50" cy="50" r={dotRadius} fill={color} />
    </svg>
  )
}
