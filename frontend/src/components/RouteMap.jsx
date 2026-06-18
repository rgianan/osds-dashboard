import React from 'react'
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer } from 'react-leaflet'

const countryColor = {
  Thailand: '#0ea5e9',
  Singapore: '#1e3a8a',
  'Hong Kong': '#f97316',
}

export function RouteMap({ routes = [] }) {
  const validRoutes = routes.filter((r) => Number.isFinite(Number(r.originLat)) && Number.isFinite(Number(r.originLng)) && Number.isFinite(Number(r.destLat)) && Number.isFinite(Number(r.destLng)))
  return (
    <div className="h-[380px] overflow-hidden rounded-2xl border border-slate-300">
      <MapContainer center={[13, 112]} zoom={4} scrollWheelZoom={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {validRoutes.map((r, idx) => {
          const color = countryColor[r.country] || '#0ea5e9'
          const from = [Number(r.originLat), Number(r.originLng)]
          const to = [Number(r.destLat), Number(r.destLng)]
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
