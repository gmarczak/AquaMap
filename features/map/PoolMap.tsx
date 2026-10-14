"use client";

import maplibregl, { type GeoJSONSource, type Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection, Point } from "geojson";
import { useEffect, useRef } from "react";
import type { Pool } from "@/lib/domain/model";

const STYLE = "https://tiles.openfreemap.org/styles/positron";
const POLAND: [number, number] = [19.4, 52.0];

type Props = {
  pools: Pool[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  center: { lat: number; lng: number } | null;
  user: { lat: number; lng: number } | null;
};

function toGeoJSON(pools: Pool[]): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: pools.map((p) => ({ type: "Feature", id: p.id, properties: { id: p.id, kind: p.kind }, geometry: { type: "Point", coordinates: [p.lng, p.lat] } })),
  };
}

/** Mapa MapLibre z darmowymi kafelkami OpenFreeMap; baseny jako warstwa z klastrami (szybko także przy ~1000 punktów). */
export function PoolMap({ pools, selectedId, onSelect, center, user }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const userMarker = useRef<maplibregl.Marker | null>(null);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // jednorazowe utworzenie mapy
  useEffect(() => {
    if (!box.current) return;
    const m = new maplibregl.Map({
      container: box.current,
      style: STYLE,
      center: center ? [center.lng, center.lat] : POLAND,
      zoom: center ? 11 : 5.3,
      attributionControl: { compact: true },
    });
    map.current = m;
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    m.on("load", () => {
      m.addSource("pools", { type: "geojson", data: toGeoJSON([]), cluster: true, clusterRadius: 44, clusterMaxZoom: 11 });
      m.addLayer({
        id: "clusters",
        type: "circle",
        source: "pools",
        filter: ["has", "point_count"],
        paint: { "circle-color": "#1d5f86", "circle-opacity": 0.85, "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 50, 26], "circle-stroke-width": 2, "circle-stroke-color": "#f5f0e8" },
      });
      m.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "pools",
        filter: ["has", "point_count"],
        layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Regular"], "text-size": 13 },
        paint: { "text-color": "#f5f0e8" },
      });
      m.addLayer({
        id: "pool",
        type: "circle",
        source: "pools",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": ["match", ["get", "kind"], "water_park", "#8a5313", "sports_centre", "#1d5f86", "#2d7a8c"],
          "circle-radius": ["case", ["boolean", ["feature-state", "selected"], false], 11, 7],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });
      m.on("click", "clusters", (e) => {
        const f = m.queryRenderedFeatures(e.point, { layers: ["clusters"] })[0];
        if (!f) return;
        const src = m.getSource("pools") as GeoJSONSource;
        void src.getClusterExpansionZoom(f.properties.cluster_id as number).then((zoom) => {
          m.easeTo({ center: (f.geometry as Point).coordinates as [number, number], zoom });
        });
      });
      m.on("click", "pool", (e) => {
        const f = e.features?.[0];
        if (f) onSelectRef.current(Number(f.properties.id));
      });
      m.on("click", (e) => {
        const hit = m.queryRenderedFeatures(e.point, { layers: ["pool", "clusters"] });
        if (hit.length === 0) onSelectRef.current(null);
      });
      for (const layer of ["clusters", "pool"]) {
        m.on("mouseenter", layer, () => (m.getCanvas().style.cursor = "pointer"));
        m.on("mouseleave", layer, () => (m.getCanvas().style.cursor = ""));
      }
      m.fire("pools-ready");
    });
    return () => {
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mapa tworzona raz; widok zmieniają osobne efekty
  }, []);

  // dane basenów
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const apply = () => (m.getSource("pools") as GeoJSONSource | undefined)?.setData(toGeoJSON(pools));
    if (m.getSource("pools")) apply();
    else m.once("pools-ready", apply);
  }, [pools]);

  // zaznaczenie
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const apply = () => {
      m.removeFeatureState({ source: "pools" });
      if (selectedId === null) return;
      m.setFeatureState({ source: "pools", id: selectedId }, { selected: true });
      const p = pools.find((x) => x.id === selectedId);
      if (p) m.easeTo({ center: [p.lng, p.lat], zoom: Math.max(m.getZoom(), 13), padding: { bottom: 220, top: 0, left: 0, right: 0 } });
    };
    if (m.getSource("pools")) apply();
    else m.once("pools-ready", apply);
    // pools celowo poza zależnościami: odświeżenie listy nie może przesuwać widoku użytkownika
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // moja lokalizacja
  useEffect(() => {
    const m = map.current;
    if (!m || !user) return;
    if (!userMarker.current) {
      const el = document.createElement("div");
      el.style.cssText = "width:16px;height:16px;border-radius:50%;background:#2f80ed;border:3px solid #fff;box-shadow:0 0 0 2px rgba(47,128,237,.35)";
      el.setAttribute("aria-label", "Twoja lokalizacja");
      userMarker.current = new maplibregl.Marker({ element: el });
    }
    userMarker.current.setLngLat([user.lng, user.lat]).addTo(m);
    m.easeTo({ center: [user.lng, user.lat], zoom: Math.max(m.getZoom(), 11.5) });
  }, [user]);

  return <div ref={box} className="h-full w-full" role="region" aria-label="Mapa basenów" />;
}
