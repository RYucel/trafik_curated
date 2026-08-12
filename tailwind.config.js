/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f4f8',
          100: '#d9e2ec',
          500: '#0055a5',
          600: '#003e7e',
          900: '#0a192f',
          danger: '#dc2626',
          warning: '#d97706',
          success: '#16a34a'
        }
      }
    },
  },
  plugins: [],
}
