/** Read live CSS custom properties for charts (theme-aware). */
export function cssVar(name: string, fallback = ""): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function chartPalette(): string[] {
  return [
    cssVar("--chart-1", "#1d9e75"),
    cssVar("--chart-2", "#1196b5"),
    cssVar("--chart-3", "#f59e0b"),
    cssVar("--chart-4", "#ef4444"),
    cssVar("--chart-5", "#8b5cf6"),
    cssVar("--chart-6", "#ec4899"),
    cssVar("--chart-7", "#14b8a6"),
    cssVar("--chart-8", "#f97316"),
  ];
}

export function riskColors(): string[] {
  return [
    cssVar("--status-success", "#15803d"),
    cssVar("--status-warning", "#b45309"),
    cssVar("--chart-8", "#f97316"),
    cssVar("--status-danger", "#b91c1c"),
  ];
}

export function useChartCssTheme() {
  return {
    grid: cssVar("--chart-grid", "rgba(15, 23, 42, 0.06)"),
    axis: cssVar("--text-muted", "#64748b"),
    tooltipBg: cssVar("--chart-tooltip-bg", "#ffffff"),
    tooltipBorder: cssVar("--chart-tooltip-border", "#d4e4df"),
    tooltipText: cssVar("--chart-tooltip-text", "#0f172a"),
    legendText: cssVar("--text-secondary", "#64748b"),
    success: cssVar("--status-success", "#15803d"),
    warning: cssVar("--status-warning", "#b45309"),
    danger: cssVar("--status-danger", "#b91c1c"),
    info: cssVar("--status-info", "#1d4ed8"),
    primary: cssVar("--primary-color", "#1d9e75"),
    secondary: cssVar("--secondary-color", "#1196b5"),
    muted: cssVar("--text-muted", "#94a3b8"),
    purple: cssVar("--chart-5", "#8b5cf6"),
    gradFill: document.documentElement.getAttribute("data-theme") === "dark" ? 0.25 : 0.15,
  };
}
