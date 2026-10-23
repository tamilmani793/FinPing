/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        obsidian: { 0: '#090A0F', 1: '#12141C', 2: '#1B1E2B', 3: '#252836', 4: '#2E3347' },
        mint: { DEFAULT: '#10B981', dim: '#34D399', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)' },
        indigo: { DEFAULT: '#6366F1', dim: '#818CF8', bg: 'rgba(99,102,241,0.12)', border: 'rgba(99,102,241,0.3)' },
        amber: { DEFAULT: '#F59E0B', dim: '#FBBF24', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)' },
        crimson: { DEFAULT: '#EF4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)' },
        surface: '#E3E1E9',
        muted: '#9CA3AF',
        faint: '#6B7280',
      },
      fontFamily: {
        sans: ['"Geist"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      borderRadius: { card: '16px', btn: '8px', pill: '9999px' },
    }
  },
  plugins: []
}
