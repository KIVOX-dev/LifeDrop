import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EmptyState } from '@/components/ui/data';

export const PALETTE = ['#B91C35', '#334155', '#D97706', '#15803D', '#7C3AED', '#0E7490', '#DB2777', '#64748B'];

const axis = { fontSize: 12, fill: '#64748B' };

export function MonthlyBars({ data, name = 'Count', color = '#B91C35' }: { data: { month: string; count: number }[]; name?: string; color?: string }) {
  if (!data.length) return <EmptyState title="No data for this period" />;
  return (
    <div className="h-64" role="img" aria-label={`${name} by month bar chart`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: -16, right: 8, top: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
          <XAxis dataKey="month" tick={axis} tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} tick={axis} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: '#F1F5F9' }} />
          <Bar dataKey="count" name={name} fill={color} radius={[6, 6, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TwoLines({ a, b, aName, bName }: { a: { month: string; count: number }[]; b: { month: string; count: number }[]; aName: string; bName: string }) {
  const months = [...new Set([...a, ...b].map((x) => x.month))].sort();
  const data = months.map((m) => ({ month: m, [aName]: a.find((x) => x.month === m)?.count ?? 0, [bName]: b.find((x) => x.month === m)?.count ?? 0 }));
  if (!data.length) return <EmptyState title="No data for this period" />;
  return (
    <div className="h-64" role="img" aria-label={`${aName} and ${bName} by month line chart`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: -16, right: 8, top: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
          <XAxis dataKey="month" tick={axis} tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} tick={axis} tickLine={false} axisLine={false} />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey={aName} stroke="#B91C35" strokeWidth={2.5} dot={{ r: 3 }} />
          <Line type="monotone" dataKey={bName} stroke="#334155" strokeWidth={2.5} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Donut({ data, label }: { data: { name: string; value: number }[]; label: string }) {
  const total = data.reduce((a, b) => a + b.value, 0);
  if (!total) return <EmptyState title="No data yet" />;
  return (
    <div className="h-64" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
            {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
          </Pie>
          <Tooltip />
          <Legend verticalAlign="bottom" height={36} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HBars({ data, color = '#334155' }: { data: { name: string; value: number }[]; color?: string }) {
  if (!data.length) return <EmptyState title="No data yet" />;
  return (
    <div style={{ height: Math.max(180, data.length * 32) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
          <XAxis type="number" allowDecimals={false} tick={axis} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="name" width={110} tick={axis} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: '#F1F5F9' }} />
          <Bar dataKey="value" fill={color} radius={[0, 6, 6, 0]} maxBarSize={20} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
