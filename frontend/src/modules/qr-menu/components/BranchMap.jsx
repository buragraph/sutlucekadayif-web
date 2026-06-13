import { useEffect, useMemo, useRef, useState } from 'react';
import { geoMercator, geoPath } from 'd3-geo';
import { MapPin } from 'lucide-react';

const WIDTH = 1000;
const HEIGHT = 520;
const PADDING = 16;
const GEOJSON_URL = '/data/tr-iller.geojson';

// GeoJSON birden çok dashboard mount'unda tekrar indirilmesin diye modül seviyesinde cache
let geoCache = null;

export default function BranchMap({ branches = [] }) {
    const [geo, setGeo] = useState(geoCache);
    const [hover, setHover] = useState(null); // { il, items, x, y }
    const wrapRef = useRef(null);

    useEffect(() => {
        if (geoCache) return;
        let alive = true;
        fetch(GEOJSON_URL)
            .then((r) => r.json())
            .then((data) => {
                geoCache = data;
                if (alive) setGeo(data);
            })
            .catch(() => {});
        return () => { alive = false; };
    }, []);

    // İl bazında şubeleri grupla (yalnızca il bilgisi olanlar)
    const ilGruplari = useMemo(() => {
        const m = new Map();
        for (const b of branches) {
            if (!b.il) continue;
            if (!m.has(b.il)) m.set(b.il, []);
            m.get(b.il).push(b);
        }
        return m;
    }, [branches]);

    // Projeksiyon + il merkezleri (geo yüklendiğinde hesaplanır)
    const { centroids, projectedPaths } = useMemo(() => {
        if (!geo) return { centroids: new Map(), projectedPaths: [] };
        const projection = geoMercator().fitExtent(
            [[PADDING, PADDING], [WIDTH - PADDING, HEIGHT - PADDING]],
            geo,
        );
        const path = geoPath(projection);
        const cents = new Map();
        const paths = geo.features.map((f) => {
            cents.set(f.properties.name, path.centroid(f));
            return { name: f.properties.name, d: path(f) };
        });
        return { centroids: cents, projectedPaths: paths };
    }, [geo]);

    const toplamSube = useMemo(
        () => [...ilGruplari.values()].reduce((a, x) => a + x.length, 0),
        [ilGruplari],
    );

    function showTooltip(il, evt) {
        const items = ilGruplari.get(il) || [];
        if (items.length === 0) return;
        const rect = wrapRef.current?.getBoundingClientRect();
        setHover({
            il,
            items,
            x: evt.clientX - (rect?.left || 0),
            y: evt.clientY - (rect?.top || 0),
        });
    }

    return (
        <div ref={wrapRef} className="relative w-full">
            {!geo ? (
                <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                    Harita yükleniyor…
                </div>
            ) : (
                <svg
                    viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                    className="h-auto w-full"
                    role="img"
                    aria-label="Şubelerin il bazında konum haritası"
                >
                    {/* İl sınırları */}
                    {projectedPaths.map((p) => {
                        const aktif = ilGruplari.has(p.name);
                        return (
                            <path
                                key={p.name}
                                d={p.d}
                                style={{
                                    fill: aktif ? 'var(--primary)' : 'var(--muted)',
                                    fillOpacity: aktif ? 0.18 : 1,
                                    stroke: 'var(--border)',
                                    strokeWidth: 0.5,
                                    transition: 'fill-opacity 0.15s',
                                }}
                            />
                        );
                    })}

                    {/* Şube işaretçileri (il merkezinde) */}
                    {[...ilGruplari.entries()].map(([il, items]) => {
                        const c = centroids.get(il);
                        if (!c) return null;
                        const [cx, cy] = c;
                        const r = items.length > 1 ? 10 : 7;
                        return (
                            <g
                                key={il}
                                style={{ cursor: 'pointer' }}
                                onMouseEnter={(e) => showTooltip(il, e)}
                                onMouseMove={(e) => showTooltip(il, e)}
                                onMouseLeave={() => setHover(null)}
                            >
                                <circle cx={cx} cy={cy} r={r + 4} style={{ fill: 'var(--primary)', opacity: 0.18 }} />
                                <circle cx={cx} cy={cy} r={r} style={{ fill: 'var(--primary)', stroke: 'var(--background)', strokeWidth: 1.5 }} />
                                {items.length > 1 && (
                                    <text
                                        x={cx}
                                        y={cy}
                                        textAnchor="middle"
                                        dominantBaseline="central"
                                        style={{ fill: 'var(--primary-foreground)', fontSize: 11, fontWeight: 600 }}
                                    >
                                        {items.length}
                                    </text>
                                )}
                            </g>
                        );
                    })}
                </svg>
            )}

            {/* Hover ipucu */}
            {hover && (
                <div
                    className="pointer-events-none absolute z-10 max-w-56 rounded-lg border bg-popover px-3 py-2 text-popover-foreground shadow-md"
                    style={{ left: hover.x + 12, top: hover.y + 12 }}
                >
                    <div className="mb-1 text-xs font-semibold">{hover.il}</div>
                    <ul className="space-y-0.5">
                        {hover.items.map((b) => (
                            <li key={b.slug} className="text-[11px] text-muted-foreground">
                                <span className="text-foreground">{b.ad}</span>
                                {b.ilce ? ` — ${b.ilce}` : ''}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Özet */}
            <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="size-3.5" />
                <span>{ilGruplari.size} ilde {toplamSube} şube</span>
            </div>
        </div>
    );
}
