import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTheme } from "../../../context/ThemeContext";

function useChartTheme() {
  const { theme } = useTheme();
  const dark = theme === "dark";
  return {
    grid: dark ? "rgba(255,255,255,0.05)" : "rgba(15,23,42,0.06)",
    axis: dark ? "#5a739a" : "#94a3b8",
    tooltipBg: dark ? "#141e35" : "#ffffff",
    tooltipBorder: dark ? "#1e2d4a" : "#d4e4df",
    tooltipText: dark ? "#e2e8f4" : "#0f172a",
    legendText: dark ? "#8fa4c0" : "#64748b",
    gradFill: dark ? 0.25 : 0.15,
  };
}

const RISK_COLORS = ["#22c78a", "#fbbf24", "#f97316", "#f87171"];

// Custom tooltip container
function ChartTooltipStyle(ct: ReturnType<typeof useChartTheme>) {
  return {
    backgroundColor: ct.tooltipBg,
    border: `1px solid ${ct.tooltipBorder}`,
    borderRadius: "8px",
    color: ct.tooltipText,
    fontSize: "12px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
  };
}

export function RiskDonut({ data }: { data: Array<{ name: string; value: number }> }) {
  const ct = useChartTheme();
  return (
    <div className="h-60">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={52}
            outerRadius={84}
            paddingAngle={3}
            strokeWidth={0}
          >
            {data.map((entry, idx) => (
              <Cell key={entry.name} fill={RISK_COLORS[idx % RISK_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={ChartTooltipStyle(ct)} />
          <Legend
            formatter={(val) => <span style={{ color: ct.legendText, fontSize: "12px" }}>{val}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TopRiskBars({ data }: { data: Array<{ name: string; riskScore: number }> }) {
  const ct = useChartTheme();
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} horizontal={false} />
          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: ct.axis }} />
          <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11, fill: ct.axis }} />
          <Tooltip contentStyle={ChartTooltipStyle(ct)} />
          <Bar dataKey="riskScore" radius={[0, 6, 6, 0]} maxBarSize={18}>
            {data.map((entry) => (
              <Cell
                key={entry.name}
                fill={
                  entry.riskScore >= 75 ? "#f87171" :
                  entry.riskScore >= 50 ? "#f97316" :
                  entry.riskScore >= 25 ? "#fbbf24" :
                  "#22c78a"
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MortalityTrendLine({ data }: { data: Array<{ day: string; mortalityPct: number }> }) {
  const ct = useChartTheme();
  const gradId = "mortGrad";
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 4 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f87171" stopOpacity={ct.gradFill * 2} />
              <stop offset="95%" stopColor="#f87171" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} />
          <XAxis dataKey="day" tick={{ fontSize: 11, fill: ct.axis }} />
          <YAxis tick={{ fontSize: 11, fill: ct.axis }} />
          <Tooltip contentStyle={ChartTooltipStyle(ct)} />
          <Area
            type="monotone"
            dataKey="mortalityPct"
            stroke="#f87171"
            strokeWidth={2.5}
            fill={`url(#${gradId})`}
            dot={{ fill: "#f87171", strokeWidth: 0, r: 3 }}
            activeDot={{ r: 5, strokeWidth: 0 }}
            name="Mortality %"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function FcrTargetBars({ data }: { data: Array<{ name: string; latestFcr: number; targetMax: number }> }) {
  const ct = useChartTheme();
  const avgTarget = data.length ? data.reduce((s, d) => s + d.targetMax, 0) / data.length : 0;
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} />
          <XAxis dataKey="name" hide />
          <YAxis tick={{ fontSize: 11, fill: ct.axis }} />
          <Tooltip contentStyle={ChartTooltipStyle(ct)} />
          <Legend formatter={(val) => <span style={{ color: ct.legendText, fontSize: "12px" }}>{val}</span>} />
          <Bar dataKey="latestFcr" fill="#38bdf8" name="Latest FCR" radius={[4, 4, 0, 0]} maxBarSize={28}>
            {data.map((entry) => (
              <Cell
                key={entry.name}
                fill={entry.latestFcr > entry.targetMax ? "#f87171" : "#38bdf8"}
              />
            ))}
          </Bar>
          {avgTarget > 0 ? (
            <ReferenceLine y={avgTarget} stroke="#fbbf24" strokeDasharray="5 3" strokeWidth={1.5}
              label={{ value: "Target", fill: ct.axis, fontSize: 10, position: "insideTopRight" }} />
          ) : null}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BlockersStacked({
  data,
}: {
  data: Array<{ name: string; overdueRounds: number; withdrawalBlockers: number }>;
}) {
  const ct = useChartTheme();
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} />
          <XAxis dataKey="name" hide />
          <YAxis tick={{ fontSize: 11, fill: ct.axis }} />
          <Tooltip contentStyle={ChartTooltipStyle(ct)} />
          <Legend formatter={(val) => <span style={{ color: ct.legendText, fontSize: "12px" }}>{val}</span>} />
          <Bar dataKey="overdueRounds" stackId="a" fill="#f97316" name="Overdue rounds" radius={[0, 0, 0, 0]} />
          <Bar dataKey="withdrawalBlockers" stackId="a" fill="#a78bfa" name="Withdrawal blockers" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SimpleCategoryBars({
  data,
  xKey,
  barKey,
  barName,
  color = "#22c78a",
}: {
  data: Array<Record<string, string | number>>;
  xKey: string;
  barKey: string;
  barName: string;
  color?: string;
}) {
  const ct = useChartTheme();
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} />
          <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: ct.axis }} />
          <YAxis tick={{ fontSize: 11, fill: ct.axis }} />
          <Tooltip contentStyle={ChartTooltipStyle(ct)} />
          <Bar dataKey={barKey} name={barName} fill={color} radius={[6, 6, 0, 0]} maxBarSize={32} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function FarmHealthGauge({ score }: { score: number }) {
  const ct = useChartTheme();
  const color = score >= 75 ? "#22c78a" : score >= 50 ? "#fbbf24" : "#f87171";
  const data = [{ value: score }, { value: 100 - score }];
  return (
    <div className="flex flex-col items-center justify-center h-48">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            startAngle={200}
            endAngle={-20}
            innerRadius={58}
            outerRadius={80}
            strokeWidth={0}
            paddingAngle={0}
          >
            <Cell fill={color} />
            <Cell fill={ct.grid} />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute flex flex-col items-center pointer-events-none">
        <span className="text-3xl font-bold tabular-nums" style={{ color }}>{score}</span>
        <span className="text-xs font-medium text-[var(--text-muted)] mt-0.5">/ 100</span>
      </div>
    </div>
  );
}

export function MortalityAreaLine({ data }: { data: Array<{ day: string; mortalityPct: number }> }) {
  const ct = useChartTheme();
  const gradId = "mortMiniGrad";
  return (
    <div className="h-28">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f87171" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#f87171" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="mortalityPct" stroke="#f87171" strokeWidth={2}
            fill={`url(#${gradId})`} dot={false} />
          <XAxis dataKey="day" hide />
          <Tooltip contentStyle={ChartTooltipStyle(ct)} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function FcrMiniLine({ data }: { data: Array<{ name: string; latestFcr: number; targetMax: number }> }) {
  const ct = useChartTheme();
  const gradId = "fcrMiniGrad";
  return (
    <div className="h-28">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Line type="monotone" dataKey="latestFcr" stroke="#38bdf8" strokeWidth={2} dot={false} name="FCR" />
          <Line type="monotone" dataKey="targetMax" stroke="#fbbf24" strokeWidth={1.5} strokeDasharray="4 2" dot={false} name="Target" />
          <XAxis dataKey="name" hide />
          <Tooltip contentStyle={ChartTooltipStyle(ct)} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
