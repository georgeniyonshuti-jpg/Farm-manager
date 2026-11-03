/** District names come from the existing Rwanda location list. Unknown stays visible. */

export function normaliseDistrict(raw, known) {
  const text = String(raw || "").trim();
  if (!text) return "District unknown";
  const set = known instanceof Set ? known : new Set(known || []);
  if (set.size === 0) return text;
  if (set.has(text)) return text;
  const hit = [...set].find((name) => name.toLowerCase() === text.toLowerCase());
  return hit || "District unknown";
}

export function districtNamesFromLocations(tree) {
  const names = new Set();
  for (const districts of Object.values(tree || {})) {
    if (districts && typeof districts === "object") {
      for (const name of Object.keys(districts)) names.add(name);
    }
  }
  return names;
}
