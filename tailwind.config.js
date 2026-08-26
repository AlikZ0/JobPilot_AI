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
        'border-strong': 'rgb(var(--jp-border-strong) / <alpha-value>)',
        content: 'rgb(var(--jp-text) / <alpha-value>)',
        muted: 'rgb(var(--jp-text-muted) / <alpha-value>)',
        brand: 'rgb(var(--jp-brand) / <alpha-value>)',
        'brand-soft': 'rgb(var(--jp-brand-soft) / <alpha-value>)',
        'brand-fg': 'rgb(var(--jp-brand-fg) / <alpha-value>)',
        excellent: 'rgb(var(--jp-excellent) / <alpha-value>)',
        good: 'rgb(var(--jp-good) / <alpha-value>)',
        potential: 'rgb(var(--jp-potential) / <alpha-value>)',
        weak: 'rgb(var(--jp-weak) / <alpha-value>)',
        poor: 'rgb(var(--jp-poor) / <alpha-value>)',
      },
      boxShadow: {
        soft: 'var(--jp-shadow-sm)',
        card: 'var(--jp-shadow-md)',
        pop: 'var(--jp-shadow-lg)',
      },
      borderRadius: {
        // Радиусы Apple: у крупных поверхностей заметно мягче, чем у элементов.
        control: '10px',
        card: '14px',
        sheet: '18px',
      },
      transitionTimingFunction: {
        // Стандартная кривая системных анимаций macOS/iOS.
        apple: 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Text',
          'SF Pro Display',
          'Inter',
          'system-ui',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SF Mono', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
