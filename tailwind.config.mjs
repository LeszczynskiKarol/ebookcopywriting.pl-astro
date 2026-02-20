/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#e3f2fd',
          100: '#bbdefb',
          200: '#90caf9',
          300: '#64b5f6',
          400: '#42a5f5',
          500: '#1a73e8',
          600: '#1565c0',
          700: '#0d47a1',
          800: '#0a3880',
          900: '#072d66',
        },
        navy: {
          700: '#1d3461',
          800: '#112240',
          900: '#0a1628',
          950: '#060e1a',
        },
        accent: {
          green: '#00c853',
          cyan: '#00b8d4',
          purple: '#7c4dff',
        },
      },
      fontFamily: {
        display: ['"Instrument Serif"', 'Georgia', 'serif'],
        body: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
