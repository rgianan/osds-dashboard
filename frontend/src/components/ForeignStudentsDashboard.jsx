import { lazy, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Users } from 'lucide-react'
import { getForeignStudentsCube } from '../lib/api.js'
import { n } from '../lib/format.js'
import { KpiCard, Panel } from './Panel.jsx'
import { DefinitionNote, EmptyState, FilterBar, Header, Visualization } from './DashboardShell.jsx'

const HorizontalBars = lazy(() => import('./Charts.jsx').then((module) => ({ default: module.HorizontalBars })))
const PhilippinesCityMap = lazy(() => import('./PhilippinesCityMap.jsx').then((module) => ({ default: module.PhilippinesCityMap })))

const DEFAULT_FILTERS = { academicYear: '', nationality: '', region: '', sex: '' }
// Position of each field inside a data cell: [academicYear, region, sex, nationality, city, count]
const CELL = { academicYear: 0, region: 1, sex: 2, nationality: 3, city: 4, count: 5 }
const TOP_NATIONALITIES = 15
const REGION_ABBREVIATIONS = [
  ['NATIONAL CAPITAL REGION', 'NCR'],
  ['CORDILLERA ADMINISTRATIVE REGION', 'CAR'],
  ['BANGSAMORO AUTONOMOUS REGION IN MUSLIM MINDANAO', 'BARMM'],
  ['AUTONOMOUS REGION IN MUSLIM MINDANAO', 'ARMM'],
  ['NEGROS ISLAND REGION', 'NIR'],
]

function regionLabel(region) {
  const match = REGION_ABBREVIATIONS.find(([full]) => region.toUpperCase().includes(full))
  return match ? region.toUpperCase().replace(match[0], match[1]) : region
}

function barHeight(rows) {
  return Math.max(220, rows * 30 + 40)
}

function ranked(names, counts, label = (name) => name) {
  return names
    .map((name, index) => ({ name: label(name), totalStudents: counts[index] }))
    .filter((row) => row.totalStudents > 0)
    .sort((a, b) => b.totalStudents - a.totalStudents || a.name.localeCompare(b.name))
}

function summarize({ dimensions, cells }, filters) {
  const active = Object.keys(DEFAULT_FILTERS)
    .filter((key) => filters[key])
    .map((key) => [CELL[key], dimensions[key].indexOf(filters[key])])
  const byRegion = new Array(dimensions.region.length).fill(0)
  const byNationality = new Array(dimensions.nationality.length).fill(0)
  const byCity = new Array(dimensions.city.length).fill(0)
  let total = 0

  for (const cell of cells) {
    if (active.some(([position, index]) => cell[position] !== index)) continue
    const count = cell[CELL.count]
    total += count
    byRegion[cell[CELL.region]] += count
    byNationality[cell[CELL.nationality]] += count
    byCity[cell[CELL.city]] += count
  }

  const nationalities = ranked(dimensions.nationality, byNationality)
  const cities = dimensions.city.map((city, index) => ({ ...city, totalStudents: byCity[index] })).filter((city) => city.totalStudents > 0)
  const isMapped = (city) => city.lat != null && city.lng != null
  return {
    total,
    regions: ranked(dimensions.region, byRegion, regionLabel),
    nationalities: nationalities.slice(0, TOP_NATIONALITIES),
    nationalityCount: nationalities.length,
    cities: cities.filter(isMapped),
    unmappedStudents: cities.filter((city) => !isMapped(city)).reduce((sum, city) => sum + city.totalStudents, 0),
  }
}

export default function ForeignStudentsDashboard() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)

  useEffect(() => {
    let isCurrent = true
    setError('')
    getForeignStudentsCube()
      .then((value) => { if (isCurrent) setData(value) })
      .catch(() => { if (isCurrent) setError('The data service did not respond. Try again in a moment.') })
    return () => { isCurrent = false }
  }, [loadAttempt])

  const summary = useMemo(() => (data ? summarize(data, filters) : null), [data, filters])
  const years = data?.dimensions.academicYear || []
  const activeFilterCount = Object.values(filters).filter(Boolean).length
  const fields = [
    { key: 'academicYear', label: 'Academic year', allLabel: 'All years', options: years },
    { key: 'nationality', label: 'Nationality', allLabel: 'All nationalities', options: data?.dimensions.nationality || [] },
    { key: 'region', label: 'Region', allLabel: 'All regions', options: data?.dimensions.region || [] },
    { key: 'sex', label: 'Sex', allLabel: 'All', options: data?.dimensions.sex || [] },
  ]
  const totalHint = filters.academicYear
    ? `Enrolled in academic year ${filters.academicYear}`
    : `Sum of ${years.length} academic years; a student enrolled in several years is counted once per year`

  return (
    <>
      <Header
        activeView="foreign-students"
        title="Foreign Students Data"
        statusLabel="Academic years"
        statusValue={years.length ? `${years[0]} to ${years[years.length - 1]}` : 'Loading...'}
      />

      <main id="dashboard-content" tabIndex={-1} className="mx-auto max-w-[1600px] px-4 py-5 outline-none sm:px-6 sm:py-7 lg:px-8">
        <FilterBar
          fields={fields}
          filters={filters}
          onChange={(key, value) => setFilters((current) => ({ ...current, [key]: value }))}
          onClear={() => setFilters(DEFAULT_FILTERS)}
          open={filtersOpen}
          onToggle={() => setFiltersOpen((current) => !current)}
        />

        <section className="mt-7" aria-busy={!data && !error} aria-labelledby="foreign-students-title">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">Foreign student enrollment</p>
              <h2 id="foreign-students-title" className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Foreign students in Philippine HEIs</h2>
              <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-600">Enrollment records reported by higher education institutions, by academic year, nationality, region, and sex.</p>
            </div>
            <p className="text-xs font-medium text-slate-500">{activeFilterCount ? `View refined by ${activeFilterCount} filter${activeFilterCount === 1 ? '' : 's'}` : 'All records included'}</p>
          </div>

          {error ? (
            <div role="alert" className="mt-5 flex flex-col gap-4 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-900 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 shrink-0" size={20} aria-hidden="true" />
                <div><p className="text-sm font-bold">Foreign students data could not be loaded</p><p className="mt-1 text-sm text-red-700">{error}</p></div>
              </div>
              <button type="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)} className="min-h-10 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 focus:outline-none focus:ring-4 focus:ring-red-200">Try again</button>
            </div>
          ) : null}

          {!data && !error ? (
            <div className="mt-5 grid gap-5" role="status" aria-label="Loading foreign students data">
              <div className="skeleton h-36 rounded-2xl sm:w-1/2 xl:w-1/4" />
              <div className="grid gap-5 xl:grid-cols-2"><div className="skeleton h-96 rounded-2xl" /><div className="skeleton h-96 rounded-2xl" /></div>
            </div>
          ) : null}

          {summary ? (
            <div className="section-enter mt-5 grid gap-5">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard icon={Users} tone="blue" label="Total foreign students" value={n(summary.total)} hint={totalHint} />
              </div>

              {summary.total === 0 ? (
                <EmptyState title="No foreign students match these filters" message="Try another academic year, nationality, region, or sex." />
              ) : (
                <>
                  <div className="grid gap-5 xl:grid-cols-2">
                    <Panel title="Foreign students by region" subtitle="Region of the higher education institution">
                      <Visualization data={summary.regions} height={barHeight(summary.regions.length)} label="Horizontal bar chart of foreign students by region" emptyTitle="No regional data">
                        <HorizontalBars data={summary.regions} valueKey="totalStudents" height={barHeight(summary.regions.length)} color="#2563eb" labelWidth={170} labelLimit={28} />
                      </Visualization>
                    </Panel>
                    <Panel
                      title="Foreign students by nationality"
                      subtitle={summary.nationalityCount > TOP_NATIONALITIES ? `Top ${TOP_NATIONALITIES} of ${n(summary.nationalityCount)} nationalities` : `${n(summary.nationalityCount)} nationalities`}
                    >
                      <Visualization data={summary.nationalities} height={barHeight(summary.nationalities.length)} label="Horizontal bar chart of foreign students by nationality" emptyTitle="No nationality data">
                        <HorizontalBars data={summary.nationalities} valueKey="totalStudents" height={barHeight(summary.nationalities.length)} color="#0f766e" />
                      </Visualization>
                      <DefinitionNote>Spelling variants in the source file are combined, for example INDIAN and Indian, or Nepalese and Nepali.</DefinitionNote>
                    </Panel>
                  </div>

                  <Panel title="Foreign students by city" subtitle="City of the higher education institution; circle size shows the number of students">
                    <Visualization data={summary.cities} height={560} label="Map of the Philippines showing foreign students by city" emptyTitle="No cities can be mapped">
                      <PhilippinesCityMap cities={summary.cities} total={summary.total} />
                    </Visualization>
                    {summary.unmappedStudents ? <DefinitionNote>{n(summary.unmappedStudents)} students attend HEIs in cities that could not be placed on the map.</DefinitionNote> : null}
                  </Panel>
                </>
              )}
            </div>
          ) : null}
        </section>
      </main>
    </>
  )
}
