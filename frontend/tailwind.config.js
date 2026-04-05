/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        arcBlue: '#0891b2',
        arcPurple: '#0e7490',
        critical: '#ef4444',
        high: '#f97316',
        medium: '#f59e0b',
        low: '#3b82f6',
        darkBg: '#060d14',
        cardBg: '#0a1520',
      },
    },
  },
  plugins: [],
}
