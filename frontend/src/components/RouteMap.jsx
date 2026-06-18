import React from 'react'
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer } from 'react-leaflet'

const countryColor = {
  Thailand: '#2563eb',
  Singapore: '#0f766e',
  'Hong Kong': '#d97706',
}

function coordinate(value, min, max) {
  if (value === '' || value == null) return null
  const number = Number(value)
  return Number.isFinite(number) && number >= min && number <= max ? number : null
}

export function RouteMap({ routes = [] }) {
  const validRoutes = (Array.isArray(routes) ? routes : []).map((route) => ({
    ...route,
    originLat: coordinate(route.originLat, -90, 90),
    originLng: coordinate(route.originLng, -180, 180),
    destLat: coordinate(route.destLat, -90, 90),
    destLng: coordinate(route.destLng, -180, 180),
  })).filter((route) => route.originLat != null && route.originLng != null && route.destLat != null && route.destLng != null)
  return (
    <div className="h-[400px] overflow-hidden rounded-xl border border-slate-200">
      <MapContainer center={[13, 112]} zoom={4} scrollWheelZoom={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {validRoutes.map((r, idx) => {
          const color = countryColor[r.country] || '#2563eb'
          const from = [r.originLat, r.originLng]
          const to = [r.destLat, r.destLng]
          return (
            <React.Fragment key={`${r.key}-${idx}`}>
              <Polyline positions={[from, to]} color={color} weight={Math.max(1, Math.min(8, Math.sqrt(Number(r.totalInterns || 1))))} opacity={0.6} />
              <CircleMarker center={to} radius={Math.max(5, Math.min(18, Math.sqrt(Number(r.totalInterns || 1)) * 2))} pathOptions={{ color, fillColor: color, fillOpacity: 0.75 }}>
                <Popup>
                  <strong>{r.country || 'Destination'}</strong><br />
                  {r.destination || 'Destination'}<br />
                  Interns: {r.totalInterns}
                </Popup>
              </CircleMarker>
            </React.Fragment>
          )
        })}
      </MapContainer>
    </div>
  )
}
