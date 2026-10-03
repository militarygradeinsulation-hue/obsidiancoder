/* Abstract world-constellation graphic. Deterministic (seeded) so the map
   renders identically on every load — no random flicker between routes. */

const SEED = 20260910;
function rng(i: number) {
  const x = Math.sin(SEED + i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/* Coarse landmass mask in a 200x100 lon/lat grid — keeps dots on continents. */
const LAND: [number, number, number, number][] = [
  [12, 18, 40, 40],
  [18, 26, 34, 52],
  [30, 58, 40, 78],
  [88, 16, 108, 34],
  [92, 30, 104, 48],
  [96, 46, 112, 70],
  [112, 18, 150, 40],
  [126, 34, 152, 52],
  [150, 52, 172, 74],
  [140, 62, 160, 74],
];
const inLand = (x: number, y: number) =>
  LAND.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);

const dots: [number, number, boolean][] = [];
for (let i = 0; i < 1400 && dots.length < 620; i++) {
  const x = rng(i) * 200;
  const y = rng(i + 7000) * 100;
  if (inLand(x, y)) dots.push([x, y, rng(i + 91) > 0.9]);
}

const HUBS: [number, number][] = [
  [26, 34],
  [34, 40],
  [46, 68],
  [96, 26],
  [99, 34],
  [104, 44],
  [120, 30],
  [134, 34],
  [145, 40],
  [152, 60],
  [150, 68],
  [112, 56],
];
const ARCS: [number, number][] = [
  [0, 3],
  [1, 4],
  [3, 6],
  [4, 7],
  [6, 8],
  [7, 9],
  [2, 5],
  [5, 11],
  [8, 10],
  [9, 10],
  [0, 1],
  [3, 4],
];

export function NetworkMap({ height = 230 }: { height?: number }) {
  const glow = "#f0a44a";
  const core = "#ffcf8a";
  return (
    <svg
      viewBox="0 0 200 100"
      width="100%"
      height={height}
      preserveAspectRatio="xMidYMid meet"
      aria-label="Global network map"
    >
      <defs>
        <radialGradient id="nm-glow">
          <stop offset="0%" stopColor={core} stopOpacity="0.9" />
          <stop offset="100%" stopColor={glow} stopOpacity="0" />
        </radialGradient>
      </defs>

      {dots.map(([x, y, bright], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={bright ? 0.55 : 0.38}
          fill={bright ? glow : "#5c6470"}
          opacity={bright ? 0.85 : 0.42}
        />
      ))}

      {ARCS.map(([a, b], i) => {
        const [x1, y1] = HUBS[a];
        const [x2, y2] = HUBS[b];
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2 - Math.abs(x2 - x1) * 0.22 - 4;
        return (
          <path
            key={i}
            d={`M${x1} ${y1} Q${mx} ${my} ${x2} ${y2}`}
            fill="none"
            stroke={glow}
            strokeWidth="0.3"
            opacity="0.42"
          />
        );
      })}

      {HUBS.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="3.4" fill="url(#nm-glow)" />
          <circle cx={x} cy={y} r="0.9" fill={core} />
        </g>
      ))}
    </svg>
  );
}
