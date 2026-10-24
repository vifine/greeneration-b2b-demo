// Leaflet maps (loaded lazily through MapLazy.tsx so the main bundle stays small).
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';
const UAE_CENTER: L.LatLngTuple = [25.12, 55.22];

function baseMap(el: HTMLElement, opts: L.MapOptions) {
  const map = L.map(el, { preferCanvas: true, zoomControl: true, attributionControl: true, ...opts });
  map.attributionControl.setPrefix(false);
  L.tileLayer(TILES, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map);
  return map;
}

/** Small map for one delivery point. Scroll-zoom is off until the map is clicked, so the page scrolls normally. */
export function MiniMap({ lat, lng, color, title }: { lat: number; lng: number; color: string; title?: string }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!el.current) return;
    const map = baseMap(el.current, { center: [lat, lng], zoom: 15, scrollWheelZoom: false });
    L.circleMarker([lat, lng], { radius: 9, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 })
      .addTo(map)
      .bindTooltip(title ?? '', { direction: 'top', offset: [0, -8] });
    map.on('click', () => map.scrollWheelZoom.enable());
    map.on('mouseout', () => map.scrollWheelZoom.disable());
    return () => {
      map.remove();
    };
  }, [lat, lng, color, title]);
  return <div ref={el} className="mini-map" role="region" aria-label="Delivery point map" />;
}

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  color: string;
  /** Popup HTML (escaped by the caller). */
  popup: string;
  title: string;
}

/** All clients as circle markers; fits the visible markers whenever the set changes. */
export function ClientsMap({ points }: { points: MapPoint[] }) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const fitKey = useRef('');

  useEffect(() => {
    if (!el.current) return;
    const map = baseMap(el.current, { center: UAE_CENTER, zoom: 10 });
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    for (const p of points) {
      L.circleMarker([p.lat, p.lng], { radius: 7, color: '#fff', weight: 1.5, fillColor: p.color, fillOpacity: 0.92 })
        .bindTooltip(p.title, { direction: 'top', offset: [0, -6] })
        .bindPopup(p.popup, { maxWidth: 300, className: 'client-popup' })
        .addTo(layer);
    }
    // Refit only when the set of visible clients changes (not on colour changes).
    const key = points.map((p) => p.id).join(',');
    if (key === fitKey.current) return;
    fitKey.current = key;
    if (points.length === 1) map.setView([points[0].lat, points[0].lng], 15);
    else if (points.length) map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as L.LatLngTuple)), { padding: [32, 32], maxZoom: 15 });
  }, [points]);

  return <div ref={el} className="clients-map" role="region" aria-label="Clients map" />;
}
