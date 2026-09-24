import { lazy, useEffect, useMemo, useState } from 'react'
import { Flag, MapPin, School, Users } from 'lucide-react'
import { getForeignStudentsCube } from '../lib/api.js'
import { n, shortRegionName } from '../lib/format.js'
import { KpiCard, Panel } from './Panel.jsx'
import { DefinitionNote, EmptyState, ErrorAlert, FilterBar, Header, PageIntro, Visualization } from './DashboardShell.jsx'

const HorizontalBars = lazy(() => import('./Charts.jsx').then((module) => ({ default: module.HorizontalBars })))
const PhilippinesCityMap = lazy(() => import('./PhilippinesCityMap.jsx').then((module) => ({ default: module.PhilippinesCityMap })))

const DEFAULT_FILTERS = { academicYear: '', nationality: '', region: '', sex: '', heiType: '', city: '', province: '' }
const TOP_NATIONALITIES = 15
const NOT_SPECIFIED = 'Not specified'
// Labels in the nationality list that are not a single nationality.
const NOT_A_NATIONALITY = new Set([NOT_SPECIFIED, 'Other'])

function barHeight(rows) {
  return Math.max(220, rows * 30 + 40)
}

function ranked(names, counts, label = (name) => name) {
  return names
    .map((name, index) => ({ name: label(name), totalStudents: counts[index] }))
    .filter((row) => row.totalStudents > 0)
    .sort((a, b) => b.totalStudents - a.totalStudents || a.name.localeCompare(b.name))
}

function summarize({ meta, dimensions, cells }, filters) {
  const positions = Object.fromEntries(meta.cellFields.map((field, index) => [field, index]))
  const active = Object.keys(DEFAULT_FILTERS)
    .filter((key) => filters[key])
    .map((key) => [positions[key], new Set(dimensions[key].flatMap((option, index) => ((key === 'city' ? option.name : option) === filters[key] ? [index] : [])))])
  const byRegion = new Array(dimensions.region.length).fill(0)
  const byNationality = new Array(dimensions.nationality.length).fill(0)
  const byCity = new Array(dimensions.city.length).fill(0)
  // Datasets published before the HEI code was added have no hei field.
  const heis = positions.hei == null ? null : new Set()
  let total = 0

  for (const row of cells) {
    if (active.some(([position, indexes]) => !indexes.has(row[position]))) continue
    const count = row[positions.count]
    total += count
    byRegion[row[positions.region]] += count
    byNationality[row[positions.nationality]] += count
    byCity[row[positions.city]] += count
    heis?.add(dimensions.hei[row[positions.hei]])
  }
  heis?.delete(NOT_SPECIFIED)

  const nationalities = ranked(dimensions.nationality, byNationality)
  const cities = dimensions.city.map((city, index) => ({ ...city, totalStudents: byCity[index] })).filter((city) => city.totalStudents > 0)
  const isMapped = (city) => city.lat != null && city.lng != null
  return {
    total,
    heiCount: heis ? heis.size : null,
    cityCount: cities.length,
    regions: ranked(dimensions.region, byRegion, shortRegionName),
    nationalities: nationalities.slice(0, TOP_NATIONALITIES),
    nationalityCount: nationalities.filter((row) => !NOT_A_NATIONALITY.has(row.name)).length,
    listedNationalities: nationalities.length,
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
    { key: 'heiType', label: 'HEI type', allLabel: 'All HEI types', options: data?.dimensions.heiType || [] },
    { key: 'city', label: 'City', allLabel: 'All cities', options: [...new Set(data?.dimensions.city?.map((city) => city.name) || [])].sort() },
    { key: 'province', label: 'Province', allLabel: 'All provinces', options: data?.dimensions.province || [] },
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

      <main id="dashboard-content" tabIndex={-1} className="mx-auto max-w-[1600px] px-4 py-5 outline-none sm:px-6 sm:pb-7 lg:px-8">
        <FilterBar
          fields={fields}
          filters={filters}
          onChange={(key, value) => setFilters((current) => ({ ...current, [key]: value }))}
          onClear={() => setFilters(DEFAULT_FILTERS)}
          open={filtersOpen}
          onToggle={() => setFiltersOpen((current) => !current)}
        />

        <section className="mt-6" aria-busy={!data && !error} aria-labelledby="foreign-students-title">
          <PageIntro
            titleId="foreign-students-title"
            title="Foreign students in Philippine HEIs"
            description="Enrollment records reported by higher education institutions."
            aside={activeFilterCount ? `View refined by ${activeFilterCount} filter${activeFilterCount === 1 ? '' : 's'}` : 'All records included'}
          />

          {error ? <ErrorAlert title="Foreign students data could not be loaded" message={error} onRetry={() => setLoadAttempt((attempt) => attempt + 1)} /> : null}

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
                <KpiCard
                  icon={School}
                  tone="violet"
                  label="HEIs with foreign students"
                  value={summary.heiCount == null ? 'N/A' : n(summary.heiCount)}
                  hint={summary.heiCount == null ? 'Not in the published data' : 'Institutions reporting at least one foreign student'}
                />
                <KpiCard icon={Flag} tone="green" label="Nationalities represented" value={n(summary.nationalityCount)} hint="Excludes Other and unspecified entries" />
                <KpiCard icon={MapPin} tone="amber" label="Cities with foreign students" value={n(summary.cityCount)} hint="Cities where those HEIs are located" />
              </div>

              {summary.total === 0 ? (
                <EmptyState title="No foreign students match these filters" message="Change or clear one or more filters." />
              ) : (
                // One row on wide screens; the map column is narrower because the country is tall.
                <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.85fr)]">
                  <Panel title="Foreign students by region" subtitle="Region of the higher education institution">
                    <Visualization data={summary.regions} height={barHeight(summary.regions.length)} label="Horizontal bar chart of foreign students by region" emptyTitle="No regional data">
                      <HorizontalBars data={summary.regions} valueKey="totalStudents" height={barHeight(summary.regions.length)} color="#2563eb" labelWidth={140} labelLimit={28} />
                    </Visualization>
                  </Panel>
                  <Panel
                    title="Foreign students by nationality"
                    subtitle={summary.listedNationalities > TOP_NATIONALITIES ? `Top ${TOP_NATIONALITIES} of ${n(summary.nationalityCount)} nationalities` : `${n(summary.nationalityCount)} nationalities`}
                  >
                    <Visualization data={summary.nationalities} height={barHeight(summary.nationalities.length)} label="Horizontal bar chart of foreign students by nationality" emptyTitle="No nationality data">
                      <HorizontalBars data={summary.nationalities} valueKey="totalStudents" height={barHeight(summary.nationalities.length)} color="#0f766e" />
                    </Visualization>
                    <DefinitionNote>Spelling variants in the source file are combined, for example INDIAN and Indian, or Nepalese and Nepali.</DefinitionNote>
                  </Panel>
                  <Panel title="Foreign students by city" subtitle="City of the HEI; circle area shows the number of students" className="lg:col-span-2 xl:col-span-1">
                    <Visualization data={summary.cities} height={560} label="Map of the Philippines showing foreign students by city" emptyTitle="No cities can be mapped">
                      <PhilippinesCityMap cities={summary.cities} total={summary.total} />
                    </Visualization>
                    {summary.unmappedStudents ? <DefinitionNote>{n(summary.unmappedStudents)} students attend HEIs in cities that could not be placed on the map.</DefinitionNote> : null}
                  </Panel>
                </div>
              )}
            </div>
          ) : null}
        </section>
      </main>
    </>
  )
}
