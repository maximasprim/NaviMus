"use client";

/**
 * Deliberately not using a charting library - per rule #24 ("avoid
 * unnecessary dependencies"), two small SVG charts don't justify
 * pulling in recharts/chart.js for a single dashboard page.
 *
 * Public API is unchanged: <LineChart points color /> and <BarChart points color />.
 * The extra props are optional.
 */
interface Point {
  label: string;
  value: number;
}

interface ChartProps {
  points: Point[];
  color?: string;
  /** Shown instead of the chart when there are no points. */
  emptyMessage?: string;
  /** Formats the value in hover tooltips. */
  formatValue?: (value: number) => string;
  /** Chart height in viewBox units (width is fixed at 640 and scales to the container). */
  height?: number;
}

const WIDTH = 640;
const DEFAULT_HEIGHT = 220;
const PAD = { top: 12, right: 12, bottom: 28, left: 44 };
const INNER_W = WIDTH - PAD.left - PAD.right;

const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
const defaultFormat = (n: number) => n.toLocaleString();

/** "2026-10-09" -> "Oct 9". Parsed by hand so a UTC date never shifts a day in local time. */
function shortDate(label: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(label);
  if (!m) return label;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Rounds up to 1, 2, 5 or 10 x 10^n so the top gridline gets a clean number. */
function niceCeil(v: number): number {
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

function labelIndexes(n: number): number[] {
  if (n <= 1) return [0];
  if (n < 5) return [0, n - 1];
  return [0, Math.floor((n - 1) / 2), n - 1];
}

function anchorFor(i: number, n: number): "start" | "middle" | "end" {
  if (n <= 1) return "middle";
  if (i === 0) return "start";
  if (i === n - 1) return "end";
  return "middle";
}

/** Horizontal gridlines with y-axis labels, plus the x-axis labels. */
function Axes({
  max,
  labels,
  xFor,
  height,
}: {
  max: number;
  labels: string[];
  xFor: (i: number) => number;
  height: number;
}) {
  const innerH = height - PAD.top - PAD.bottom;
  const ticks = [0, 0.5, 1].map((f) => ({ f, v: max * f }));
  const n = labels.length;
  return (
    <g>
      {ticks.map(({ f, v }) => {
        const y = PAD.top + innerH - f * innerH;
        // Half-way ticks on tiny scales are fractions (2.5 bookings) - draw the line, skip the label.
        const showLabel = Number.isInteger(v) || max >= 10;
        return (
          <g key={f}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y}
              y2={y}
              stroke="#E2E8E4"
              strokeDasharray={f === 0 ? undefined : "3 4"}
            />
            {showLabel && (
              <text x={PAD.left - 10} y={y + 4} textAnchor="end" className="fill-fog text-[11px] tabular-nums">
                {compact.format(v)}
              </text>
            )}
          </g>
        );
      })}
      {labelIndexes(n).map((i) => (
        <text
          key={i}
          x={xFor(i)}
          y={height - 8}
          textAnchor={anchorFor(i, n)}
          className="fill-fog text-[11px]"
        >
          {shortDate(labels[i])}
        </text>
      ))}
    </g>
  );
}

export function LineChart({
  points,
  color = "#3C6E5E",
  emptyMessage,
  formatValue = defaultFormat,
  height = DEFAULT_HEIGHT,
}: ChartProps) {
  if (points.length === 0) return <EmptyState message={emptyMessage} />;
  const n = points.length;
  const innerH = height - PAD.top - PAD.bottom;
  const max = niceCeil(Math.max(...points.map((p) => p.value), 1));
  const xFor = (i: number) => (n === 1 ? PAD.left + INNER_W / 2 : PAD.left + (i * INNER_W) / (n - 1));
  const yFor = (v: number) => PAD.top + innerH - (v / max) * innerH;

  const coords = points.map((p, i) => ({ x: xFor(i), y: yFor(p.value), ...p }));
  const line = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const baseY = PAD.top + innerH;
  const area = `${line} L${coords[n - 1].x.toFixed(1)},${baseY} L${coords[0].x.toFixed(1)},${baseY} Z`;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${height}`}
      className="w-full"
      role="img"
      aria-label={`Line chart of ${n} data point${n === 1 ? "" : "s"}`}
    >
      <Axes max={max} labels={points.map((p) => p.label)} xFor={xFor} height={height} />
      {n > 1 && <path d={area} fill={color} fillOpacity={0.1} />}
      {n > 1 && (
        <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      )}
      {coords.map((c, i) => (
        <g key={i}>
          {(n <= 31 || i === n - 1) && <circle cx={c.x} cy={c.y} r={3} fill="#fff" stroke={color} strokeWidth={2} />}
          {/* Generous invisible target so the native tooltip is easy to trigger. */}
          <circle cx={c.x} cy={c.y} r={10} fill="transparent">
            <title>{`${shortDate(c.label)}: ${formatValue(c.value)}`}</title>
          </circle>
        </g>
      ))}
    </svg>
  );
}

export function BarChart({
  points,
  color = "#3C6E5E",
  emptyMessage,
  formatValue = defaultFormat,
  height = DEFAULT_HEIGHT,
}: ChartProps) {
  if (points.length === 0) return <EmptyState message={emptyMessage} />;
  const n = points.length;
  const innerH = height - PAD.top - PAD.bottom;
  const max = niceCeil(Math.max(...points.map((p) => p.value), 1));
  const slot = INNER_W / n;
  const barW = Math.min(slot * 0.62, 36);
  const xFor = (i: number) => PAD.left + slot * i + slot / 2;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${height}`}
      className="w-full"
      role="img"
      aria-label={`Bar chart of ${n} data point${n === 1 ? "" : "s"}`}
    >
      <Axes max={max} labels={points.map((p) => p.label)} xFor={xFor} height={height} />
      {points.map((p, i) => {
        const h = p.value > 0 ? Math.max((p.value / max) * innerH, 2) : 0;
        return (
          <rect
            key={i}
            x={xFor(i) - barW / 2}
            y={PAD.top + innerH - h}
            width={barW}
            height={h}
            rx={Math.min(3, barW / 2)}
            fill={color}
            className="transition-opacity hover:opacity-75"
          >
            <title>{`${shortDate(p.label)}: ${formatValue(p.value)}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

function EmptyState({ message = "No data in this range yet." }: { message?: string }) {
  return (
    <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-hairline px-4 text-center text-sm text-fog">
      {message}
    </div>
  );
}
