import { lazy, useEffect, useMemo, useState } from 'react'
import { Flag, MapPin, School, Users } from 'lucide-react'
import { getForeignStudentsCube } from '../lib/api.js'
import { formatDataDate, n, shortRegionName } from '../lib/format.js'
import { KpiCard, Panel } from './Panel.jsx'
import { DefinitionNote, EmptyState, ErrorAlert, FilterBar, Header, PageIntro, Visualization } from './DashboardShell.jsx'

const HorizontalBars = lazy(() => import('./Charts.jsx').then((module) => ({ default: module.HorizontalBars })))
const PhilippinesCityMap = lazy(() => import('./PhilippinesCityMap.jsx').then((module) => ({ default: module.PhilippinesCityMap })))

const DEFAULT_FILTERS = { academicYear: '', nationality: '', region: '', sex: '', heiType: '', city: '', province: '', hei: '' }
const TOP_NATIONALITIES = 15
const NOT_SPECIFIED = 'Not specified'
// Labels in the nationality list that are not a single nationality.
const NOT_A_NATIONALITY = new Set([NOT_SPECIFIED, 'Other'])

function barHeight(rows) {
  return Math.max(220, rows * 30 + 40)
}

// Columns of the screen-reader table that accompanies each chart.
function studentColumns(nameLabel) {
  return [{ key: 'name', label: nameLabel }, { key: 'totalStudents', label: 'Students', num: true }]
}

function ranked(names, counts, label = (name) => name) {
  return names
    .map((name, index) => ({ name: label(name), totalStudents: counts[index] }))
    .filter((row) => row.totalStudents > 0)
    .sort((a, b) => b.totalStudents - a.totalStudents || a.name.localeCompare(b.name))
}

// "Sta. Cruz" is a city in three provinces, so a repeated city name carries its province.
function cityLabels(cities = []) {
  const repeats = new Map()
  for (const city of cities) repeats.set(city.name, (repeats.get(city.name) || 0) + 1)
  return cities.map((city) => (repeats.get(city.name) > 1 ? `${city.name}, ${city.province}` : city.name))
}

// Alphabetical regardless of case, so "Adamson University" sorts before "AMA School of Medicine".
const byName = (a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })

// HEIs are { code, name }: the filter shows the name, the count uses the code.
function heiNames(heis = []) {
  return heis.map((hei) => hei.name)
}

function summarize({ meta, dimensions, cells }, filters) {
  const positions = Object.fromEntries(meta.cellFields.map((field, index) => [field, index]))
  const optionLabels = { ...dimensions, city: cityLabels(dimensions.city), hei: heiNames(dimensions.hei) }
  const active = Object.keys(DEFAULT_FILTERS)
    .filter((key) => filters[key])
    .map((key) => [positions[key], new Set(optionLabels[key].flatMap((option, index) => (option === filters[key] ? [index] : [])))])
  const byRegion = new Array(dimensions.region.length).fill(0)
  const byNationality = new Array(dimensions.nationality.length).fill(0)
  const byCity = new Array(dimensions.city.length).fill(0)
  // The trend by year ignores the year filter, so it always shows every year for the
  // other filters and the selected year can be read against the rest.
  const byYear = new Array(dimensions.academicYear.length).fill(0)
  const yearFilter = active.find(([position]) => position === positions.academicYear)
  const otherFilters = active.filter((filter) => filter !== yearFilter)
  // Datasets published before the HEI code was added have no hei field.
  const heis = positions.hei == null ? null : new Set()
  let total = 0

  for (const row of cells) {
    if (otherFilters.some(([position, indexes]) => !indexes.has(row[position]))) continue
    const count = row[positions.count]
    byYear[row[positions.academicYear]] += count
    if (yearFilter && !yearFilter[1].has(row[positions.academicYear])) continue
    total += count
    byRegion[row[positions.region]] += count
    byNationality[row[positions.nationality]] += count
    byCity[row[positions.city]] += count
    heis?.add(dimensions.hei[row[positions.hei]].code)
  }
  heis?.delete(NOT_SPECIFIED)

  const nationalities = ranked(dimensions.nationality, byNationality)
  const cities = dimensions.city.map((city, index) => ({ ...city, totalStudents: byCity[index] })).filter((city) => city.totalStudents > 0)
  const isMapped = (city) => city.lat != null && city.lng != null
  return {
    total,
    heiCount: heis ? heis.size : null,
    cityCount: cities.length,
    years: dimensions.academicYear.map((name, index) => ({ name, totalStudents: byYear[index] })),
    regions: ranked(dimensions.region, byRegion, shortRegionName),
    nationalities: nationalities.slice(0, TOP_NATIONALITIES),
    nationalityCount: nationalities.filter((row) => !NOT_A_NATIONALITY.has(row.name)).length,
    listedNationalities: nationalities.length,
    cities: cities.filter(isMapped).sort((a, b) => b.totalStudents - a.totalStudents),
    unmappedStudents: cities.filter((city) => !isMapped(city)).reduce((sum, city) => sum + city.totalStudents, 0),
  }
}

// "2020-2021" -> "2020-21"
function shortYear(year) {
  return String(year).replace(/^(\d{4})-\d{2}(\d{2})$/, '$1-$2')
}

// Five small bars beside the total: the page covers several academic years, and without
// this the years exist only as a filter. A selected year stays solid; the others fade.
function YearTrend({ years, selected }) {
  if (years.length < 2) return null
  const max = Math.max(1, ...years.map((year) => year.totalStudents))
  return (
    <div className="w-28 shrink-0 sm:w-32">
      <div className="flex h-8 items-end gap-1" aria-hidden="true">
        {years.map((year) => (
          <div
            key={year.name}
            title={`${year.name}: ${n(year.totalStudents)}`}
            className={`flex-1 rounded-t-sm bg-blue-600 ${selected && selected !== year.name ? 'opacity-30' : ''}`}
            style={{ height: `${Math.max(6, (year.totalStudents / max) * 100)}%` }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs leading-4 text-slate-500" aria-hidden="true">
        <span>{shortYear(years[0].name)}</span>
        <span>{shortYear(years[years.length - 1].name)}</span>
      </div>
      <p className="sr-only">Students by academic year: {years.map((year) => `${year.name}, ${n(year.totalStudents)}`).join('; ')}.</p>
    </div>
  )
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
    { key: 'region', label: 'Region', allLabel: 'All regions', options: data?.dimensions.region || [], format: shortRegionName },
    { key: 'sex', label: 'Sex', allLabel: 'All', options: data?.dimensions.sex || [] },
    { key: 'hei', label: 'HEI', allLabel: 'All HEIs', options: heiNames(data?.dimensions.hei).filter((name) => name !== NOT_SPECIFIED).sort(byName) },
    { key: 'heiType', label: 'HEI type', allLabel: 'All HEI types', options: data?.dimensions.heiType || [] },
    { key: 'city', label: 'City', allLabel: 'All cities', options: [...new Set(cityLabels(data?.dimensions.city))].sort(byName) },
    { key: 'province', label: 'Province', allLabel: 'All provinces', options: data?.dimensions.province || [] },
  ]
  const totalHint = filters.academicYear
    ? `Enrolled in academic year ${filters.academicYear}`
    : `Sum of ${years.length} academic years; a student enrolled in several years is counted once per year`
  const yearRange = years.length ? `, academic years ${years[0]} to ${years[years.length - 1]}` : ''

  return (
    <>
      <Header activeView="foreign-students" title="Foreign Students Data" dataAsOf={formatDataDate(data?.generatedAt)} />

      <main id="dashboard-content" tabIndex={-1} className="mx-auto max-w-[1600px] px-4 py-5 outline-none sm:px-6 sm:pb-7 lg:px-8">
        {/* Every page reads in one order: what this page is, then the filters, then the data. */}
        <PageIntro
          titleId="foreign-students-title"
          title="Foreign students in Philippine HEIs"
          description={`Enrollment records reported by higher education institutions${yearRange}.`}
          aside={activeFilterCount ? `View refined by ${activeFilterCount} filter${activeFilterCount === 1 ? '' : 's'}` : 'All records included'}
        />

        <div className="mt-4">
          <FilterBar
            fields={fields}
            filters={filters}
            onChange={(key, value) => setFilters((current) => ({ ...current, [key]: value }))}
            onClear={() => setFilters(DEFAULT_FILTERS)}
            open={filtersOpen}
            onToggle={() => setFiltersOpen((current) => !current)}
          />
        </div>

        <section aria-busy={!data && !error} aria-labelledby="foreign-students-title">
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
                <KpiCard icon={Users} label="Total foreign students" value={n(summary.total)} hint={totalHint} aside={<YearTrend years={summary.years} selected={filters.academicYear} />} />
                <KpiCard
                  icon={School}
                  label="HEIs with foreign students"
                  value={summary.heiCount == null ? 'N/A' : n(summary.heiCount)}
                  hint={summary.heiCount == null ? 'Not in the published data' : 'Institutions reporting at least one foreign student'}
                />
                <KpiCard icon={Flag} label="Nationalities represented" value={n(summary.nationalityCount)} hint="Excludes Other and unspecified entries" />
                <KpiCard icon={MapPin} label="Cities with foreign students" value={n(summary.cityCount)} hint="Cities where those HEIs are located" />
              </div>

              {summary.total === 0 ? (
                <EmptyState title="No foreign students match these filters" message="Change or clear one or more filters." />
              ) : (
                // One row on wide screens; the map column is narrower because the country is tall.
                <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.85fr)]">
                  <Panel title="Foreign students by region" subtitle="Region of the higher education institution">
                    <Visualization data={summary.regions} height={barHeight(summary.regions.length)} label="Horizontal bar chart of foreign students by region" emptyTitle="No regional data" columns={studentColumns('Region')}>
                      <HorizontalBars data={summary.regions} valueKey="totalStudents" height={barHeight(summary.regions.length)} color="#2563eb" labelWidth={140} labelLimit={28} />
                    </Visualization>
                  </Panel>
                  <Panel
                    title="Foreign students by nationality"
                    subtitle={summary.listedNationalities > TOP_NATIONALITIES ? `Top ${TOP_NATIONALITIES} of ${n(summary.nationalityCount)} nationalities` : `${n(summary.nationalityCount)} nationalities`}
                  >
                    <Visualization data={summary.nationalities} height={barHeight(summary.nationalities.length)} label="Horizontal bar chart of foreign students by nationality" emptyTitle="No nationality data" columns={studentColumns('Nationality')}>
                      <HorizontalBars data={summary.nationalities} valueKey="totalStudents" height={barHeight(summary.nationalities.length)} color="#0f766e" />
                    </Visualization>
                    <DefinitionNote>Spelling variants in the source file are combined, for example INDIAN and Indian, or Nepalese and Nepali.</DefinitionNote>
                  </Panel>
                  <Panel title="Foreign students by city" subtitle="City of the HEI; circle area shows the number of students" className="lg:col-span-2 xl:col-span-1">
                    <Visualization
                      data={summary.cities}
                      height={560}
                      label="Map of the Philippines showing foreign students by city"
                      emptyTitle="No cities can be mapped"
                      columns={[{ key: 'name', label: 'City' }, { key: 'province', label: 'Province' }, { key: 'totalStudents', label: 'Students', num: true }]}
                    >
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
