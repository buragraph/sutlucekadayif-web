import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapPin } from 'lucide-react';
import ilMerkezleri from '@/data/tr-il-merkezleri.json';

// OpenFreeMap Positron — ücretsiz, anahtarsız, sade (bina/POI detayı yok)
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const TURKIYE_MERKEZ = [35.2, 39.0];
const GEOJSON_URL = '/data/tr-iller.geojson';

// İl GeoJSON'u yalnızca odak (sube_sahibi) modunda gerekir — modül seviyesinde cache
let geoCache = null;

// Dünya kutusu içinde il poligonunu "delik" yapan maske (dışı soluklaştırmak için)
function buildMask(feature) {
    const world = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
    const holes = [];
    const g = feature.geometry;
    if (g.type === 'Polygon') holes.push(g.coordinates[0]);
    else if (g.type === 'MultiPolygon') g.coordinates.forEach((p) => holes.push(p[0]));
    return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [world, ...holes] } };
}

export default function BranchMap({ branches = [], focusIl = null, focusCoord = null, className = 'h-[440px] w-full', showFooter = true }) {
    const containerRef = useRef(null);
    const mapRef = useRef(null);
    const markersRef = useRef([]);
    const [ready, setReady] = useState(false);
    const [geo, setGeo] = useState(geoCache);

    // Şubenin harita konumu: önce ilçe (lat/lng), yoksa il merkezi
    const koordOf = (b) =>
        (Number.isFinite(b.lat) && Number.isFinite(b.lng))
            ? [b.lng, b.lat]
            : (b.il && ilMerkezleri[b.il]) || null;

    // Aynı konumdaki şubeleri tek noktada grupla (ilçe seviyesi)
    const noktalar = useMemo(() => {
        const m = new Map();
        for (const b of branches) {
            const lngLat = koordOf(b);
            if (!lngLat) continue;
            const key = lngLat.join(',');
            if (!m.has(key)) m.set(key, { lngLat, items: [] });
            m.get(key).items.push(b);
        }
        return [...m.values()];
    }, [branches]);

    const yerliSubeler = useMemo(() => branches.filter((b) => koordOf(b)), [branches]);
    const toplamSube = yerliSubeler.length;
    const ilSayisi = new Set(yerliSubeler.map((b) => b.il).filter(Boolean)).size;

    // Odak modunda il geometrisini getir (yalnızca sube_sahibi)
    useEffect(() => {
        if (!focusIl || geoCache) return;
        fetch(GEOJSON_URL).then((r) => r.json()).then((d) => { geoCache = d; setGeo(d); }).catch(() => {});
    }, [focusIl]);

    // Haritayı bir kez kur
    useEffect(() => {
        if (mapRef.current || !containerRef.current) return;
        const map = new maplibregl.Map({
            container: containerRef.current,
            style: STYLE_URL,
            center: focusIl && ilMerkezleri[focusIl] ? ilMerkezleri[focusIl] : TURKIYE_MERKEZ,
            zoom: focusIl ? 8 : 4.4,
            attributionControl: { compact: true },
        });
        map.scrollZoom.disable();
        map.on('load', () => setReady(true));
        mapRef.current = map;

        // Container yeniden boyutlanınca (yan yana düzen, pencere) haritayı uyumla
        const ro = new ResizeObserver(() => map.resize());
        ro.observe(containerRef.current);

        return () => { ro.disconnect(); map.remove(); mapRef.current = null; setReady(false); };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // İşaretçiler + kamera
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;
        markersRef.current.forEach((mk) => mk.remove());
        markersRef.current = [];

        const bounds = new maplibregl.LngLatBounds();

        for (const { lngLat, items } of noktalar) {
            const el = document.createElement('div');
            el.style.cssText = 'display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:9999px;background:var(--primary);color:var(--primary-foreground);font-size:11px;font-weight:700;box-shadow:0 0 0 4px color-mix(in srgb, var(--primary) 22%, transparent);cursor:pointer;';
            if (items.length > 1) el.textContent = String(items.length);
            const baslik = items[0].ilce ? `${items[0].ilce}, ${items[0].il}` : (items[0].il || 'Şube');
            const liste = items
                .map((b) => `<li style="font-size:11px;color:var(--muted-foreground)"><span style="color:var(--foreground)">${b.ad}</span>${b.ilce ? ' — ' + b.ilce : ''}</li>`)
                .join('');
            const popup = new maplibregl.Popup({ offset: 18, closeButton: false }).setHTML(
                `<div style="font-size:12px;font-weight:600;margin-bottom:4px">${baslik}</div><ul style="margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:2px">${liste}</ul>`,
            );
            const marker = new maplibregl.Marker({ element: el }).setLngLat(lngLat).setPopup(popup).addTo(map);
            markersRef.current.push(marker);
            bounds.extend(lngLat);
        }

        // Kamera: ilçe koordinatı varsa ona yakınlaş; yoksa il merkezi; admin'de tümüne sığdır
        if (focusCoord) {
            map.easeTo({ center: focusCoord, zoom: 11, duration: 600 });
        } else if (focusIl && ilMerkezleri[focusIl]) {
            map.easeTo({ center: ilMerkezleri[focusIl], zoom: 8, duration: 600 });
        } else if (noktalar.length === 1) {
            map.easeTo({ center: noktalar[0].lngLat, zoom: 8, duration: 600 });
        } else if (noktalar.length > 1) {
            map.fitBounds(bounds, { padding: 64, maxZoom: 10, duration: 600 });
        }
    }, [noktalar, focusIl, focusCoord]);

    // Odak ili: dışını soluklaştıran maske + il sınırı + mavi kapsama dairesi
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !ready) return;

        const ids = ['focus-outline', 'focus-mask'];
        const srcs = ['focus-il', 'focus-mask-src'];
        const temizle = () => {
            // Harita unmount'ta kaldırıldıysa (mapRef sıfırlanır) layer'a dokunma —
            // aksi halde kaldırılmış harita üzerinde getLayer çağrısı çöker (style undefined)
            if (mapRef.current !== map) return;
            ids.forEach((id) => { if (map.getLayer(id)) map.removeLayer(id); });
            srcs.forEach((id) => { if (map.getSource(id)) map.removeSource(id); });
        };
        temizle();

        const feature = focusIl && geo ? geo.features.find((f) => f.properties.name === focusIl) : null;
        if (!feature) return;

        // 1) Maske — il dışını soluklaştır
        map.addSource('focus-mask-src', { type: 'geojson', data: buildMask(feature) });
        map.addLayer({ id: 'focus-mask', type: 'fill', source: 'focus-mask-src', paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.62 } });

        // 2) İl sınırı
        map.addSource('focus-il', { type: 'geojson', data: feature });
        map.addLayer({ id: 'focus-outline', type: 'line', source: 'focus-il', paint: { 'line-color': '#084529', 'line-width': 1.5, 'line-opacity': 0.6 } });

        return temizle;
    }, [ready, focusIl, geo]);

    return (
        <div className="relative h-full w-full">
            <div ref={containerRef} className={`${className} overflow-hidden`} />
            {showFooter && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="size-3.5" />
                    <span>{ilSayisi} ilde {toplamSube} şube</span>
                </div>
            )}
        </div>
    );
}
