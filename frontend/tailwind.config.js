/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'],
      },
      // The redesign's palette (OSDS Dashboard Redesign.figcraft): CHED navy, seal blue and
      // gold, a quiet page, and ink shades for text.
      colors: {
        brand: { navy: '#0B2A5B', blue: '#0038A8', gold: '#F2B705' },
        page: '#F3F5F9',
        line: '#E2E7EF',
        ink: { DEFAULT: '#0B1B33', 2: '#4A5A70', 3: '#6B7A90' },
      },
      boxShadow: {
        panel: '0 12px 30px rgba(15, 23, 42, 0.08)',
        card: '0 1px 3px rgba(11, 27, 51, 0.05)',
      },
    },
  },
  plugins: [],
}
