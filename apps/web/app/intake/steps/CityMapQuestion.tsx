"use client";

import { useEffect, useState } from "react";
import { MOBILE_SHELL_MEDIA } from "@/lib/viewport-mode";
import { Map as ArcMap, MapControls, MapMarker, MarkerContent, MarkerLabel } from "@/components/ui/mapcn-map-arc";

type CityGeo = {
  name: string;
  center: [number, number];
};

const DEFAULT_CENTER: [number, number] = [-70.6483, -33.4569];
const CACHE = new globalThis.Map<string, CityGeo | null>();

async function geocodeCity(city: string): Promise<CityGeo | null> {
  const normalized = city.trim().toLowerCase();
  if (!normalized) return null;
  if (CACHE.has(normalized)) return CACHE.get(normalized) ?? null;

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", city);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return null;

  const data = (await res.json()) as Array<{ display_name?: string; lat?: string; lon?: string }>;
  const first = data[0];
  if (!first?.lat || !first?.lon) {
    CACHE.set(normalized, null);
    return null;
  }

  const result = {
    name: first.display_name?.split(",")[0]?.trim() || city,
    center: [Number(first.lon), Number(first.lat)] as [number, number],
  };
  CACHE.set(normalized, result);
  return result;
}

export function CityMapQuestion({
  city,
  onCityChange,
  onGeocodeResolved,
}: {
  city: string;
  onCityChange: (value: string) => void;
  onGeocodeResolved?: (resolved: boolean) => void;
}) {
  const [resolved, setResolved] = useState<CityGeo | null>(null);
  const [loading, setLoading] = useState(false);
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia(MOBILE_SHELL_MEDIA);
    const syncViewport = (event?: MediaQueryList | MediaQueryListEvent) => {
      setIsCompactViewport(event?.matches ?? mediaQuery.matches);
    };

    syncViewport(mediaQuery);
    mediaQuery.addEventListener("change", syncViewport);
    return () => mediaQuery.removeEventListener("change", syncViewport);
  }, []);

  useEffect(() => {
    const trimmed = city.trim();
    if (!trimmed) {
      setResolved(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      void geocodeCity(trimmed)
        .then((result) => {
          if (!cancelled) setResolved(result);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [city]);

  useEffect(() => {
    onGeocodeResolved?.(!!resolved);
  }, [resolved, onGeocodeResolved]);

  const center = resolved?.center ?? DEFAULT_CENTER;
  const zoom = resolved ? 9 : 3.2;
  const shouldRenderMap = !isCompactViewport || !isFocused;

  return (
    <div className="intake-city-map-shell animate-intake-in">
      <input
        id="city"
        className="intake-input"
        placeholder="Ej: Santiago, Valparaíso, Concepción"
        value={city}
        onChange={(e) => onCityChange(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        aria-label="Tu ciudad"
        autoFocus
      />
      {shouldRenderMap ? (
        <div className="intake-city-map-frame">
          <ArcMap
            center={center}
            zoom={zoom}
            attributionControl={false}
            dragPan={false}
            scrollZoom={false}
            doubleClickZoom={false}
            touchZoomRotate={false}
            loading={loading}
          >
            <MapControls position="bottom-right" showZoom={true} showCompass={false} showLocate={false} />
            {resolved && (
              <MapMarker longitude={resolved.center[0]} latitude={resolved.center[1]}>
                <MarkerContent>
                  <div className="size-3 rounded-full border-2 border-white bg-sky-400 shadow-md shadow-sky-500/40" />
                  <MarkerLabel
                    position="top"
                    className="rounded-full border border-white/12 bg-[#0b1118]/82 px-2 py-1 text-[11px] font-semibold backdrop-blur"
                  >
                    {resolved.name}
                  </MarkerLabel>
                </MarkerContent>
              </MapMarker>
            )}
          </ArcMap>
        </div>
      ) : null}
      <p className="intake-question-hint">
        {resolved ? `Mostrando ${resolved.name}.` : "Escribe tu ciudad y el mapa se enfoca ahí."}
      </p>
    </div>
  );
}
