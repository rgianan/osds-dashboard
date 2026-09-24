import { CircleMarker, MapContainer, TileLayer, Tooltip } from 'react-leaflet'
import { n } from '../lib/format.js'

const PHILIPPINES_BOUNDS = [[4.4, 116.8], [21.2, 126.8]]
const MIN_RADIUS = 4
const MAX_RADIUS = 30

function radius(count, max) {
  // Area, not radius, is proportional to the count so large cities don't overstate their size.
  return Math.max(MIN_RADIUS, Math.sqrt(count / max) * MAX_RADIUS)
}

export function PhilippinesCityMap({ cities = [], total = 0 }) {
  const max = Math.max(1, ...cities.map((city) => city.totalStudents))
  // Draw the largest circles first so smaller cities stay on top and remain hoverable.
  const ordered = [...cities].sort((a, b) => b.totalStudents - a.totalStudents)

  return (
    <div className="h-[460px] overflow-hidden rounded-xl border border-slate-200 sm:h-[560px]">
      {/* Fractional zoom lets the country fill the frame instead of snapping to a smaller whole zoom level. */}
      <MapContainer bounds={PHILIPPINES_BOUNDS} boundsOptions={{ padding: [4, 4] }} zoomSnap={0.1} zoomDelta={0.5} scrollWheelZoom={false} minZoom={5}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {ordered.map((city) => (
          <CircleMarker
            key={`${city.name}|${city.province}`}
            center={[city.lat, city.lng]}
            radius={radius(city.totalStudents, max)}
            pathOptions={{ color: '#1d4ed8', weight: 1, fillColor: '#2563eb', fillOpacity: 0.45 }}
          >
            <Tooltip>
              <strong>{city.name}</strong>, {city.province}<br />
              {n(city.totalStudents)} foreign students{total ? ` (${Math.round((city.totalStudents / total) * 1000) / 10}%)` : ''}
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  )
}
