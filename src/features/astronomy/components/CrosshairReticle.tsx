/**
 * Professional crosshair reticle - colored lines with black outline for visibility
 * against bright camera backgrounds.
 */
export function CrosshairReticle({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 100 100" className="w-20 h-20">
      {/* Black outline/shadow layer for visibility against bright backgrounds */}
      <line x1="0" y1="50" x2="35" y2="50" stroke="black" strokeWidth="4" />
      <line x1="65" y1="50" x2="100" y2="50" stroke="black" strokeWidth="4" />
      <line x1="50" y1="0" x2="50" y2="35" stroke="black" strokeWidth="4" />
      <line x1="50" y1="65" x2="50" y2="100" stroke="black" strokeWidth="4" />
      <circle cx="50" cy="50" r="5" fill="black" />

      {/* Colored foreground layer */}
      <line x1="0" y1="50" x2="35" y2="50" stroke={color} strokeWidth="2" />
      <line x1="65" y1="50" x2="100" y2="50" stroke={color} strokeWidth="2" />
      <line x1="50" y1="0" x2="50" y2="35" stroke={color} strokeWidth="2" />
      <line x1="50" y1="65" x2="50" y2="100" stroke={color} strokeWidth="2" />
      <circle cx="50" cy="50" r="3" fill={color} />
    </svg>
  )
}
