/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./src/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        surface: 'rgb(var(--jp-surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--jp-surface-2) / <alpha-value>)',
        'surface-3': 'rgb(var(--jp-surface-3) / <alpha-value>)',
        border: 'rgb(var(--jp-border) / <alpha-value>)',
        content: 'rgb(var(--jp-text) / <alpha-value>)',
        muted: 'rgb(var(--jp-text-muted) / <alpha-value>)',
        brand: 'rgb(var(--jp-brand) / <alpha-value>)',
        'brand-fg': 'rgb(var(--jp-brand-fg) / <alpha-value>)',
        excellent: 'rgb(var(--jp-excellent) / <alpha-value>)',
        good: 'rgb(var(--jp-good) / <alpha-value>)',
        potential: 'rgb(var(--jp-potential) / <alpha-value>)',
        weak: 'rgb(var(--jp-weak) / <alpha-value>)',
        poor: 'rgb(var(--jp-poor) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
