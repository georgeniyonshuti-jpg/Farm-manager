import { useEffect, useMemo, useState } from "react";
import { geoCentroid, geoMercator, geoPath } from "d3-geo";
import type { FeatureCollection, Geometry } from "geojson";
import { SegmentedControl } from "../ui";
import {
  circleRadius,
  districtFromFeature,
  offMapSentence,
  placeFor,
  splitMapRows,
  type MapRow,
} from "./districtMapModel";

const WIDTH = 360;
const HEIGHT = 320;

export type MapLayer = {
  id: string;
  label: string;
  rows: MapRow[];
};

function isCollection(data: unknown): data is FeatureCollection<Geometry> {
  if (!data || typeof data !== "object") return false;
  const value = data as FeatureCollection<Geometry>;
  return value.type === "FeatureCollection" && Array.isArray(value.features);
}

export function DistrictMap({
  layers,
  onSelect,
}: {
  layers: MapLayer[];
  onSelect?: (district: string) => void;
}) {
  const [geo, setGeo] = useState<FeatureCollection<Geometry> | null>(null);
  const [failed, setFailed] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [layerId, setLayerId] = useState(layers[0]?.id ?? "");

  useEffect(() => {
    let cancelled = false;
    fetch("/data/districts.geojson")
      .then((res) => {
        if (!res.ok) throw new Error("missing");
        return res.json();
      })
      .then((data: unknown) => {
        if (cancelled) return;
        if (!isCollection(data)) {
          setFailed(true);
          return;
        }
        setGeo(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const active = layers.find((layer) => layer.id === layerId) ?? layers[0];
  const rows = active?.rows ?? [];
  const measure = (active?.label || "the count").toLowerCase();

  const projection = useMemo(() => {
    if (!geo) return null;
    return geoMercator().fitExtent(
      [
        [8, 8],
        [WIDTH - 8, HEIGHT - 8],
      ],
      geo,
    );
  }, [geo]);

  const path = useMemo(() => (projection ? geoPath(projection) : null), [projection]);

  const { onMap } = splitMapRows(rows);
  const byName = new Map(onMap.map((row) => [row.district, row]));
  const max = Math.max(0, ...onMap.map((row) => (Number.isFinite(row.value) ? row.value : 0)));
  const activeName = hover || pinned;
  const activeRow = activeName ? byName.get(activeName) : undefined;

  const circles = useMemo(() => {
    if (!geo || !projection) return [];
    return geo.features.flatMap((feature) => {
      const name = districtFromFeature(feature.properties);
      const row = name ? byName.get(name) : undefined;
      if (!name || !row || !(row.value > 0)) return [];
      const [lng, lat] = geoCentroid(feature);
      const place = placeFor(name, row.sector, { lng, lat });
      if (!place) return [];
      const xy = projection([place.lng, place.lat]);
      if (!xy) return [];
      return [
        {
          name,
          x: xy[0],
          y: xy[1],
          r: circleRadius(row.value, max),
          value: row.value,
          label: row.label,
          caption: place.caption,
        },
      ];
    });
  }, [geo, projection, byName, max]);

  const mark = circles.find((circle) => circle.name === activeName);
  const caption = activeRow
    ? mark
      ? `${activeRow.district}: ${activeRow.label}. ${mark.caption}`
      : `${activeRow.district}: ${activeRow.label}.`
    : activeName
      ? `${activeName}: no row for this district`
      : "Point at a district";
  const aside = offMapSentence(rows);

  function choose(name: string) {
    setPinned(name);
    onSelect?.(name);
  }

  function chooseLayer(next: string) {
    setLayerId(next);
    setHover(null);
  }

  return (
    <figure className="min-w-0">
      {layers.length > 1 && active ? (
        <div className="mb-2">
          <SegmentedControl
            label="Map layer"
            size="sm"
            value={active.id}
            onChange={chooseLayer}
            options={layers.map((layer) => ({ value: layer.id, label: layer.label }))}
          />
        </div>
      ) : null}
      {failed ? (
        <p className="type-caption text-[var(--text-muted)]" role="alert">
          District boundaries are not loaded yet.
        </p>
      ) : null}
      {!failed && !geo ? <p className="type-caption text-[var(--text-muted)]">Loading map…</p> : null}
      {rows.length === 0 ? (
        <p className="type-caption text-[var(--text-secondary)]">No districts in this filter.</p>
      ) : null}
      {/* Fixed height. An SVG with no height collapses and the map looks blank. */}
      <div style={{ width: "100%", height: HEIGHT }}>
        {geo && path && projection ? (
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            width="100%"
            height="100%"
            role="group"
            aria-label={`Districts with circles for ${measure}`}
          >
            {geo.features.map((feature, index) => {
              const name = districtFromFeature(feature.properties);
              const row = name ? byName.get(name) : undefined;
              const d = path(feature) || "";
              const selected = Boolean(name && name === activeName);
              return (
                <path
                  key={name || `shape-${index}`}
                  d={d}
                  fill="var(--border-strong)"
                  stroke={selected ? "var(--text-primary)" : "var(--surface-card)"}
                  strokeWidth={selected ? 2 : 1}
                  tabIndex={name ? 0 : undefined}
                  role={name ? "button" : undefined}
                  aria-label={name ? `${name}. ${row ? row.label : "No row for this district."}` : undefined}
                  style={{ cursor: name ? "pointer" : "default" }}
                  onMouseEnter={() => {
                    if (name) setHover(name);
                  }}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => {
                    if (name) setHover(name);
                  }}
                  onBlur={() => setHover(null)}
                  onClick={() => {
                    if (name) choose(name);
                  }}
                  onKeyDown={(event) => {
                    if (!name) return;
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    choose(name);
                  }}
                />
              );
            })}
            {circles.map((circle) => (
              <g key={circle.name}>
                <circle
                  cx={circle.x}
                  cy={circle.y}
                  r={circle.r}
                  fill="var(--brand-primary, var(--chart-1))"
                  stroke="var(--surface-card)"
                  strokeWidth={1}
                  tabIndex={0}
                  role="button"
                  aria-label={`${circle.name}. ${circle.label}. ${circle.caption}`}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHover(circle.name)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(circle.name)}
                  onBlur={() => setHover(null)}
                  onClick={() => choose(circle.name)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    choose(circle.name);
                  }}
                />
                <text
                  x={circle.x + circle.r + 2}
                  y={circle.y}
                  fontSize={11}
                  fill="var(--text-primary)"
                  dominantBaseline="middle"
                  style={{ pointerEvents: "none" }}
                >
                  {circle.value}
                </text>
              </g>
            ))}
          </svg>
        ) : null}
      </div>
      <figcaption className="mt-2 text-sm text-[var(--text-primary)]" aria-live="polite">
        {caption}
      </figcaption>
      <ul
        className="mt-2 flex flex-wrap gap-x-4 gap-y-1 type-caption text-[var(--text-muted)]"
        aria-label="Legend"
      >
        <li>Larger circle: more {measure}</li>
        <li>No circle: none</li>
        <li>Grey: district outline</li>
      </ul>
      {aside ? <p className="mt-2 type-caption text-[var(--text-secondary)]">{aside}</p> : null}
      <p className="mt-2 type-caption text-[var(--text-muted)]">Boundaries: geoBoundaries (CC BY 4.0).</p>
    </figure>
  );
}
