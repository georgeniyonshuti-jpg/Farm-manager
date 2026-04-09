import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const riskColors = ["#16a34a", "#f59e0b", "#f97316", "#ef4444"];

export function RiskDonut({ data }: { data: Array<{ name: string; value: number }> }) {
  return (
    <div className="h-60">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={88} paddingAngle={2}>
            {data.map((entry, idx) => (
              <Cell key={entry.name} fill={riskColors[idx % riskColors.length]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TopRiskBars({ data }: { data: Array<{ name: string; riskScore: number }> }) {
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 20, right: 10 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" domain={[0, 100]} />
          <YAxis type="category" dataKey="name" width={140} />
          <Tooltip />
          <Bar dataKey="riskScore" fill="#1d9e75" radius={[0, 6, 6, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MortalityTrendLine({ data }: { data: Array<{ day: string; mortalityPct: number }> }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="day" />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey="mortalityPct" stroke="#ef4444" strokeWidth={2.5} dot />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function FcrTargetBars({ data }: { data: Array<{ name: string; latestFcr: number; targetMax: number }> }) {
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 6, right: 6 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" hide />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="latestFcr" fill="#0ea5e9" name="Latest FCR" radius={[6, 6, 0, 0]} />
          <Bar dataKey="targetMax" fill="#a3a3a3" name="Target max" radius={[6, 6, 0, 0]} />
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
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" hide />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="overdueRounds" stackId="a" fill="#f97316" name="Overdue rounds" />
          <Bar dataKey="withdrawalBlockers" stackId="a" fill="#8b5cf6" name="Withdrawal blockers" />
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
  color = "#1d9e75",
}: {
  data: Array<Record<string, string | number>>;
  xKey: string;
  barKey: string;
  barName: string;
  color?: string;
}) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey={xKey} />
          <YAxis />
          <Tooltip />
          <Bar dataKey={barKey} name={barName} fill={color} radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
