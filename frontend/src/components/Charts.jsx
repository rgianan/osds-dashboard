import { useCallback, useEffect, useRef, useState } from 'react'
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
const LABEL_COLOR = '#334155'
const VALUE_COLOR = '#475569'
const FONT_SIZE = 12
// On phone-width screens (below Tailwind's sm) a bar chart writes each category name
// above its bar: a label column would take about half of the chart.
const NARROW_SCREEN = '(max-width: 639px)'
const NARROW_ROW_HEIGHT = 44
const NARROW_BAR_SIZE = 14
const BAR_GAP = 2
// Recharts does not draw an axis 0px wide, and narrow charts draw names from the axis ticks.
const NARROW_AXIS_WIDTH = 1
const asIs = (value) => value
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

// Legend text defaults to each series' color, which fails contrast for light
// series such as amber; keep the colored dot and write the label in slate.
function legendText(value) {
  return <span style={{ color: LABEL_COLOR }}>{value}</span>
}

const LEGEND_STYLE = { fontSize: FONT_SIZE }

function matchesNarrowScreen() {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.(NARROW_SCREEN).matches)
}

// Phone-width screens get names above the bars. The chart's own width sets how many
// characters a name may use; it is read on mount and then observed, so the first render
// does not wait for a resize notification.
function useNarrowChart() {
  const [narrowScreen, setNarrowScreen] = useState(matchesNarrowScreen)
  const [width, setWidth] = useState(0)
  const observer = useRef(null)
  useEffect(() => {
    const query = window.matchMedia?.(NARROW_SCREEN)
    if (!query) return undefined
    const update = () => setNarrowScreen(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  const measureRef = useCallback((node) => {
    observer.current?.disconnect()
    if (!node) return
    setWidth(Math.round(node.getBoundingClientRect().width))
    if (typeof ResizeObserver === 'undefined') return
    observer.current = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    observer.current.observe(node)
  }, [])
  const narrow = narrowScreen && width > 0
  // About 7px per character at 12px leaves room for the value label on the right.
  return { narrow, nameLimit: Math.max(12, Math.floor((width - 60) / 7)), measureRef }
}

// Category axis tick for narrow charts: the name is written above the row's bars, from the
// left edge, instead of in a label column. The axis has one tick per row whatever the
// values, so no name goes missing when a row's first bar is zero. y is the band's center.
function nameAboveTick(format, limit, barsHalfHeight) {
  return function NameAboveTick({ y, payload }) {
    return <text x={1} y={y - barsHalfHeight - 5} fill={LABEL_COLOR} fontSize={FONT_SIZE} textAnchor="start">{shortLabel(format(payload.value), limit)}</text>
  }
}

function categoryTick(narrow, format, nameLimit, barsHeight) {
  return narrow ? nameAboveTick(format, nameLimit, barsHeight / 2) : { fill: LABEL_COLOR, fontSize: FONT_SIZE }
}

function narrowHeight(rows, extra) {
  return rows * NARROW_ROW_HEIGHT + extra
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
        <Legend verticalAlign="bottom" iconType="circle" formatter={legendText} wrapperStyle={{ ...LEGEND_STYLE, paddingTop: 8 }} />
      </PieChart>
    </ResponsiveContainer>
  )
}

// tickFormat shortens the axis label only; the tooltip still shows the full name.
export function HorizontalBars({ data, valueKey = 'totalInterns', height = 320, color = '#2563eb', labelWidth = 150, labelLimit = 24, tickFormat = (value) => value }) {
  const safeData = Array.isArray(data) ? data : []
  const { narrow, nameLimit, measureRef } = useNarrowChart()
  return (
    <div ref={measureRef}>
      <ResponsiveContainer width="100%" height={narrow ? narrowHeight(safeData.length, 36) : height}>
        <BarChart data={safeData} layout="vertical" margin={{ top: 6, right: 48, left: 0, bottom: 4 }} accessibilityLayer>
          <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tickFormatter={compact} tick={{ fill: AXIS_COLOR, fontSize: FONT_SIZE }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey={label} width={narrow ? NARROW_AXIS_WIDTH : labelWidth} interval={0} tickFormatter={(value) => shortLabel(tickFormat(value), labelLimit)} tick={categoryTick(narrow, tickFormat, nameLimit, NARROW_BAR_SIZE)} axisLine={false} tickLine={false} />
          <Tooltip formatter={tooltipFormatter} contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#f8fafc' }} />
          <Bar dataKey={valueKey} radius={[0, 6, 6, 0]} fill={color} maxBarSize={narrow ? NARROW_BAR_SIZE : 26} isAnimationActive={!REDUCE_MOTION} animationDuration={450}>
            <LabelList dataKey={valueKey} position="right" formatter={(value) => n(value)} fill={VALUE_COLOR} fontSize={FONT_SIZE} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function MonthLine({ data }) {
  const safeData = Array.isArray(data) ? data : []
  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={safeData} margin={{ top: 12, right: 24, left: 0, bottom: 8 }} accessibilityLayer>
        <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="yearMonth" tick={{ fill: AXIS_COLOR, fontSize: FONT_SIZE }} axisLine={false} tickLine={false} minTickGap={24} />
        <YAxis allowDecimals={false} tick={{ fill: AXIS_COLOR, fontSize: FONT_SIZE }} axisLine={false} tickLine={false} />
        <Tooltip formatter={tooltipFormatter} contentStyle={TOOLTIP_STYLE} />
        <Legend iconType="circle" formatter={legendText} wrapperStyle={LEGEND_STYLE} />
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
        <XAxis dataKey="yearMonth" tick={{ fill: AXIS_COLOR, fontSize: FONT_SIZE }} axisLine={false} tickLine={false} minTickGap={20} />
        <YAxis allowDecimals={false} tick={{ fill: AXIS_COLOR, fontSize: FONT_SIZE }} axisLine={false} tickLine={false} />
        <Tooltip formatter={tooltipFormatter} contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#f8fafc' }} />
        <Bar name="Endorsements" dataKey="totalEndorsements" fill="#0f766e" radius={[6, 6, 0, 0]} maxBarSize={38} isAnimationActive={!REDUCE_MOTION} animationDuration={450} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// Horizontal bars with several values per row, side by side or stacked.
// series: [{ key, label, color }]; data rows: { name, [key]: number }
export function MultiBars({ data, series, height = 360, stacked = false, labelWidth = 150, labelLimit = 24 }) {
  const safeData = Array.isArray(data) ? data : []
  const { narrow, nameLimit, measureRef } = useNarrowChart()
  // Side-by-side bars need a taller row than one stacked bar.
  const rowScale = stacked ? 1 : 1.4
  return (
    <div ref={measureRef}>
      <ResponsiveContainer width="100%" height={narrow ? narrowHeight(safeData.length * rowScale, 70) : height}>
        <BarChart data={safeData} layout="vertical" margin={{ top: 6, right: stacked ? 24 : 40, left: 0, bottom: 4 }} barGap={BAR_GAP} accessibilityLayer>
          <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={{ fill: AXIS_COLOR, fontSize: FONT_SIZE }} axisLine={false} tickLine={false} />
          <YAxis
            type="category"
            dataKey="name"
            width={narrow ? NARROW_AXIS_WIDTH : labelWidth}
            interval={0}
            tickFormatter={(value) => shortLabel(value, labelLimit)}
            tick={categoryTick(narrow, asIs, nameLimit, stacked ? NARROW_BAR_SIZE : series.length * NARROW_BAR_SIZE + (series.length - 1) * BAR_GAP)}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip formatter={(value, name) => [n(value), name]} contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#f8fafc' }} />
          <Legend iconType="circle" formatter={legendText} wrapperStyle={LEGEND_STYLE} />
          {series.map((item, index) => (
            <Bar
              key={item.key}
              dataKey={item.key}
              name={item.label}
              fill={item.color || COLORS[index % COLORS.length]}
              stackId={stacked ? 'total' : undefined}
              // A fixed size keeps a row's bars together under its name; a capped size
              // would center each bar in its own slot and drift them apart.
              barSize={narrow ? NARROW_BAR_SIZE : undefined}
              maxBarSize={stacked ? 22 : 14}
              radius={stacked ? (index === series.length - 1 ? [0, 5, 5, 0] : 0) : [0, 4, 4, 0]}
              isAnimationActive={!REDUCE_MOTION}
              animationDuration={450}
            >
              {stacked ? null : <LabelList dataKey={item.key} position="right" formatter={(value) => n(value)} fill={VALUE_COLOR} fontSize={FONT_SIZE} />}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function StackedHeiCountryBars({ data, countries }) {
  const safeData = Array.isArray(data) ? data : []
  const activeCountries = (Array.isArray(countries) ? countries : []).filter((country) => safeData.some((row) => Number(row[country]) > 0))
  const { narrow, nameLimit, measureRef } = useNarrowChart()
  return (
    <div ref={measureRef}>
      <ResponsiveContainer width="100%" height={narrow ? narrowHeight(safeData.length, 80) : 340}>
        <BarChart data={safeData} layout="vertical" stackOffset="expand" margin={{ top: 8, right: 18, left: 0, bottom: 8 }} accessibilityLayer>
          <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} tickFormatter={(value) => `${Math.round(value * 100)}%`} tick={{ fill: AXIS_COLOR, fontSize: FONT_SIZE }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" width={narrow ? NARROW_AXIS_WIDTH : 150} interval={0} tickFormatter={(value) => shortLabel(value)} tick={categoryTick(narrow, asIs, nameLimit, NARROW_BAR_SIZE)} axisLine={false} tickLine={false} />
          <Tooltip formatter={tooltipFormatter} contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#f8fafc' }} />
          <Legend iconType="circle" formatter={legendText} wrapperStyle={LEGEND_STYLE} />
          {activeCountries.map((country, index) => (
            <Bar key={country} dataKey={country} stackId="country" fill={COLORS[index % COLORS.length]} maxBarSize={narrow ? NARROW_BAR_SIZE : undefined} isAnimationActive={!REDUCE_MOTION} animationDuration={450} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
