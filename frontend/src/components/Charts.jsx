import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
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

const COLORS = ['#2563eb', '#0f766e', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#64748b']
const GRID_COLOR = '#e2e8f0'
const AXIS_COLOR = '#64748b'
const REDUCE_MOTION = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const TOOLTIP_STYLE = {
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  boxShadow: '0 12px 28px rgba(15, 23, 42, 0.12)',
  color: '#0f172a',
  fontSize: 12,
}

function label(row) {
  return row.name || row.label || row.key || row.country || row.region || row.yearMonth || ''
}

function shortLabel(value, limit = 24) {
  const text = String(value || '')
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text
}

function tooltipFormatter(value, name) {
  const readableName = String(name || '').replace(/([A-Z])/g, ' $1').replace(/^./, (character) => character.toUpperCase())
  return [n(value), readableName]
}

export function Donut({ data, valueKey = 'totalInterns', nameKey = 'name' }) {
  const safeData = Array.isArray(data) ? data : []
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart accessibilityLayer>
        <Pie
          data={safeData}
          dataKey={valueKey}
          nameKey={nameKey}
          innerRadius={58}
          outerRadius={86}
          paddingAngle={3}
          stroke="#ffffff"
          strokeWidth={2}
          labelLine={false}
          label={({ percent }) => percent >= 0.08 ? `${Math.round(percent * 100)}%` : ''}
          isAnimationActive={!REDUCE_MOTION}
          animationDuration={450}
        >
          {safeData.map((item, index) => <Cell key={`${item[nameKey] || 'slice'}-${index}`} fill={COLORS[index % COLORS.length]} />)}
        </Pie>
        <Tooltip formatter={tooltipFormatter} contentStyle={TOOLTIP_STYLE} />
        <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ color: AXIS_COLOR, fontSize: 11, paddingTop: 8 }} />
      </PieChart>
    </ResponsiveContainer>
  )
}

export function HorizontalBars({ data, valueKey = 'totalInterns', height = 320, color = '#2563eb' }) {
  const safeData = Array.isArray(data) ? data : []
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={safeData} layout="vertical" margin={{ top: 6, right: 48, left: 0, bottom: 4 }} accessibilityLayer>
        <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tickFormatter={compact} tick={{ fill: AXIS_COLOR, fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey={label} width={150} tickFormatter={(value) => shortLabel(value)} tick={{ fill: '#334155', fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip formatter={tooltipFormatter} contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#f8fafc' }} />
        <Bar dataKey={valueKey} radius={[0, 6, 6, 0]} fill={color} maxBarSize={26} isAnimationActive={!REDUCE_MOTION} animationDuration={450}>
          <LabelList dataKey={valueKey} position="right" formatter={(value) => n(value)} fill="#475569" fontSize={11} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function MonthLine({ data }) {
  const safeData = Array.isArray(data) ? data : []
  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={safeData} margin={{ top: 12, right: 24, left: 0, bottom: 8 }} accessibilityLayer>
        <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="yearMonth" tick={{ fill: AXIS_COLOR, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
        <YAxis allowDecimals={false} tick={{ fill: AXIS_COLOR, fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip formatter={tooltipFormatter} contentStyle={TOOLTIP_STYLE} />
        <Legend iconType="circle" wrapperStyle={{ color: AXIS_COLOR, fontSize: 11 }} />
        <Line name="Intern starts" type="monotone" dataKey="internStarts" stroke="#2563eb" strokeWidth={3} dot={false} activeDot={{ r: 5 }} isAnimationActive={!REDUCE_MOTION} animationDuration={500} />
        <Line name="Intern completions" type="monotone" dataKey="internEnds" stroke="#d97706" strokeWidth={3} dot={false} activeDot={{ r: 5 }} isAnimationActive={!REDUCE_MOTION} animationDuration={500} />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function EndorsementMonths({ data }) {
  const safeData = Array.isArray(data) ? data : []
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={safeData} margin={{ top: 12, right: 20, left: 0, bottom: 8 }} accessibilityLayer>
        <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="yearMonth" tick={{ fill: AXIS_COLOR, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={20} />
        <YAxis allowDecimals={false} tick={{ fill: AXIS_COLOR, fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip formatter={tooltipFormatter} contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#f8fafc' }} />
        <Bar name="Endorsements" dataKey="totalEndorsements" fill="#0f766e" radius={[6, 6, 0, 0]} maxBarSize={38} isAnimationActive={!REDUCE_MOTION} animationDuration={450} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function StackedHeiCountryBars({ data, countries }) {
  const safeData = Array.isArray(data) ? data : []
  const activeCountries = (Array.isArray(countries) ? countries : []).filter((country) => safeData.some((row) => Number(row[country]) > 0))
  return (
    <ResponsiveContainer width="100%" height={340}>
      <BarChart data={safeData} layout="vertical" stackOffset="expand" margin={{ top: 8, right: 18, left: 0, bottom: 8 }} accessibilityLayer>
        <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} tickFormatter={(value) => `${Math.round(value * 100)}%`} tick={{ fill: AXIS_COLOR, fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" width={150} tickFormatter={(value) => shortLabel(value)} tick={{ fill: '#334155', fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip formatter={tooltipFormatter} contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#f8fafc' }} />
        <Legend iconType="circle" wrapperStyle={{ color: AXIS_COLOR, fontSize: 11 }} />
        {activeCountries.map((country, index) => <Bar key={country} dataKey={country} stackId="country" fill={COLORS[index % COLORS.length]} isAnimationActive={!REDUCE_MOTION} animationDuration={450} />)}
      </BarChart>
    </ResponsiveContainer>
  )
}
