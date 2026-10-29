const KEYWORD_SCENES: { keywords: string[]; scene: Scene }[] = [
  {
    scene: "beach",
    keywords: [
      "beach", "coast", "island", "diani", "zanzibar", "malindi", "watamu", "lamu",
      "mauritius", "shore", "bay", "reef", "lagoon",
    ],
  },
  {
    scene: "mountain",
    keywords: ["mountain", "kilimanjaro", "highland", "peak", "hill", "ruwenzori", "aberdare"],
  },
  {
    scene: "city",
    keywords: ["nairobi", "dubai", "city", "town", "kampala", "cairo", "istanbul", "downtown"],
  },
  {
    scene: "safari",
    keywords: [
      "mara", "safari", "serengeti", "amboseli", "tsavo", "samburu", "savanna", "savannah",
      "bush", "reserve", "national park", "wildlife", "migration",
    ],
  },
];

type Scene = "beach" | "mountain" | "city" | "safari" | "route";

function sceneFor(seed: string): Scene {
  const lower = seed.toLowerCase();
  for (const { scene, keywords } of KEYWORD_SCENES) {
    if (keywords.some((k) => lower.includes(k))) return scene;
  }
  return "route";
}

/** Cheap deterministic hash so unmatched names still get visual variety
 * (a horizon tint + marker position) instead of all collapsing to one look. */
function hash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
}

const PALETTES: Record<Scene, [string, string, string]> = {
  // [far layer, near layer, sky/accent]
  safari: ["#12463D", "#0E9B7C", "#F2A93B"],
  beach: ["#0B322D", "#0E9B7C", "#F2A93B"],
  mountain: ["#0B322D", "#145043", "#FFCE85"],
  city: ["#0B322D", "#12463D", "#F2543D"],
  route: ["#0B322D", "#12463D", "#F2A93B"],
};

/**
 * Renders a small illustrated scene as inline SVG, sized to fill its
 * container. Purely decorative (aria-hidden) - the card's heading
 * carries the actual name for screen readers.
 */
export function SceneArt({ seed, className }: { seed: string; className?: string }) {
  const scene = sceneFor(seed);
  const h = hash(seed);
  const [far, near, accent] = PALETTES[scene];
  const sunCx = 60 + (h % 180);
  const sunCy = 30 + (h % 20);

  return (
    <svg
      viewBox="0 0 300 140"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden="true"
    >
      <rect width="300" height="140" fill={far} />
      <circle cx={sunCx} cy={sunCy} r="22" fill={accent} opacity="0.9" />

      {scene === "safari" && (
        <>
          <path d="M0 100 Q 75 70 150 95 T 300 90 V140 H0 Z" fill={near} />
          {/* acacia silhouette */}
          <g opacity="0.85" fill={far}>
            <rect x={(h % 220) + 20} y="60" width="4" height="30" />
            <path d={`M${(h % 220) + 2} 62 q 20 -18 40 0 q -20 -6 -40 0 Z`} />
          </g>
        </>
      )}

      {scene === "beach" && (
        <>
          <path d="M0 95 Q 80 80 150 92 T 300 88 V140 H0 Z" fill={near} />
          <path d="M0 112 Q 90 100 150 110 T 300 104 V140 H0 Z" fill={accent} opacity="0.35" />
          <g stroke={far} strokeWidth="2" opacity="0.7">
            <line x1={(h % 240) + 20} y1="130" x2={(h % 240) + 8} y2="100" />
            <line x1={(h % 240) + 20} y1="130" x2={(h % 240) + 32} y2="100" />
            <line x1={(h % 240) + 20} y1="130" x2={(h % 240) + 20} y2="96" />
          </g>
        </>
      )}

      {scene === "mountain" && (
        <>
          <path d="M0 110 L60 55 L100 90 L150 40 L210 95 L260 65 L300 100 V140 H0 Z" fill={near} />
          <path d="M100 90 L120 76 L140 90 Z" fill="#FFFDF8" opacity="0.8" />
          <path d="M150 40 L166 60 L134 60 Z" fill="#FFFDF8" opacity="0.85" />
        </>
      )}

      {scene === "city" && (
        <>
          <rect x="0" y="70" width="300" height="70" fill={near} />
          {Array.from({ length: 7 }).map((_, i) => {
            const x = i * 44 + (h % 20);
            const bh = 20 + ((h + i * 37) % 55);
            return <rect key={i} x={x} y={110 - bh} width="26" height={bh} fill={far} opacity="0.9" />;
          })}
        </>
      )}

      {scene === "route" && (
        <>
          <path d="M0 105 Q 90 130 150 100 T 300 95 V140 H0 Z" fill={near} />
          <path
            d={`M 10 ${100 - (h % 30)} Q 100 ${40 + (h % 40)} 150 ${70 - (h % 20)} T 290 ${50 + (h % 30)}`}
            fill="none"
            stroke={accent}
            strokeWidth="2"
            strokeDasharray="5 6"
            opacity="0.9"
          />
          <circle cx="10" cy={100 - (h % 30)} r="4" fill={accent} />
          <circle cx="290" cy={50 + (h % 30)} r="4" fill={accent} />
        </>
      )}
    </svg>
  );
}
