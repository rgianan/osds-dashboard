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
} from 'recharts'
import { compact, n } from '../lib/format.js'

const PALETTE = ['#0ea5e9', '#1e3a8a', '#f97316', '#7e22ce', '#db2777', '#6366f1', '#eab308', '#10b981', '#ef4444', '#64748b']

function label(row) {
  return row.name || row.label || row.key || row.country || row.region || row.yearMonth || ''
}

export function Donut({ data, valueKey = 'totalInterns', nameKey = 'name' }) {
  const total = data.reduce((sum, item) => sum + Number(item[valueKey] || 0), 0)
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie data={data} dataKey={valueKey} nameKey={nameKey} innerRadius={64} outerRadius={96} paddingAngle={2} label={(p) => `${n(p.value)} (${total ? ((p.value / total) * 100).toFixed(2) : '0'}%)`}>
          {data.map((_, idx) => <Cell key={idx} fill={PALETTE[idx % PALETTE.length]} />)}
        </Pie>
        <Tooltip formatter={(v) => n(v)} />
        <Legend layout="vertical" align="right" verticalAlign="middle" />
      </PieChart>
    </ResponsiveContainer>
  )
}

export function HorizontalBars({ data, valueKey = 'totalInterns', height = 320 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 10, right: 24, left: 12, bottom: 10 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tickFormatter={compact} />
        <YAxis type="category" dataKey={label} width={190} tick={{ fontSize: 11 }} />
        <Tooltip formatter={(v) => n(v)} />
        <Bar dataKey={valueKey} radius={[0, 8, 8, 0]} fill="#0ea5e9" />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function MonthLine({ data }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 16, right: 24, left: 0, bottom: 10 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="yearMonth" tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} />
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey="internStarts" stroke="#0ea5e9" strokeWidth={3} dot />
        <Line type="monotone" dataKey="internEnds" stroke="#1e3a8a" strokeWidth={3} dot />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function EndorsementMonths({ data }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 16, right: 24, left: 0, bottom: 10 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="yearMonth" tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} />
        <Tooltip />
        <Bar dataKey="totalEndorsements" fill="#0ea5e9" radius={[8, 8, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function StackedHeiCountryBars({ data, countries }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} layout="vertical" stackOffset="expand" margin={{ top: 10, right: 24, left: 12, bottom: 10 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tickFormatter={(v) => `${Math.round(v * 100)}%`} />
        <YAxis type="category" dataKey="name" width={190} tick={{ fontSize: 11 }} />
        <Tooltip formatter={(v) => n(v)} />
        <Legend />
        {countries.map((c, idx) => <Bar key={c} dataKey={c} stackId="a" fill={PALETTE[idx % PALETTE.length]} />)}
      </BarChart>
    </ResponsiveContainer>
  )
}
