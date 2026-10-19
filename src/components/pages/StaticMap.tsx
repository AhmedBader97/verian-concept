import worldDots from "@/data/world-dots.json";
import { OFFICES } from "@/data/offices";
import { projectNormalised } from "@/lib/field/math";

/** A static dot-matrix world map with office markers, drawn as one SVG path. */
export function StaticMap({ width = 1200 }: { width?: number }) {
  const height = Math.round(width / worldDots.aspect);
  const d = worldDots.world;
  let path = "";
  for (let i = 0; i < d.length; i += 2) path += `M${(d[i]! * width).toFixed(1)} ${(d[i + 1]! * height).toFixed(1)}h0`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label="World map with Verian's 23 offices marked">
      <path d={path} stroke="var(--ink)" strokeOpacity="0.55" strokeWidth={width / 520} strokeLinecap="round" />
      {OFFICES.map((o) => {
        const [x, y] = projectNormalised(o.lon, o.lat, worldDots.bounds);
        return (
          <g key={o.city}>
            <circle cx={x * width} cy={y * height} r={width / 160} fill="var(--marigold)" stroke="var(--paper)" strokeWidth={width / 600} />
          </g>
        );
      })}
    </svg>
  );
}
