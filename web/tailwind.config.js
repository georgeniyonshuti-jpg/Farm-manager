/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: ["selector", "[data-theme='dark']"],
  theme: {
    extend: {
      colors: {
        surface: "var(--surface-color)",
        "surface-card": "var(--surface-card)",
        "surface-elevated": "var(--surface-elevated)",
        "surface-subtle": "var(--surface-subtle)",
        "app-bg": "var(--background-color)",
        "app-border": "var(--border-color)",
        "app-text": "var(--text-primary)",
        "app-text-2": "var(--text-secondary)",
        "app-text-muted": "var(--text-muted)",
        "app-primary": "var(--primary-color)",
        "app-primary-soft": "var(--primary-color-soft)",
        "chart-bg": "var(--chart-bg)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        soft: "var(--shadow-soft)",
        elevated: "var(--shadow-elevated)",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        "2xl": "var(--radius-2xl)",
      },
      animation: {
        "fade-up": "fade-in-up 350ms ease both",
        "live-pulse": "live-pulse 2s ease-in-out infinite",
        count: "count-up 300ms cubic-bezier(0.175, 0.885, 0.32, 1.275) both",
      },
    },
  },
  plugins: [],
};
