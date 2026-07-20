/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['selector', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {
    colors: {
      navy: { DEFAULT: '#1A3A6B', 50: '#EFF4FF', 100: '#DCE8FF', 600: '#1A3A6B', 700: '#142D54', 800: '#0D1E38', 900: '#060F1C' },
    }
  }},
  plugins: [],
}
