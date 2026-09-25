/** @type {import('tailwindcss').Config} */
// Cores do painel apontam para variáveis CSS (ver src/index.css) — três temas: light, dark, night.
const v = (nome) => `rgb(var(--${nome}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"DM Sans"', 'system-ui', 'sans-serif'] },
      fontWeight: { light: '300', normal: '400', medium: '500', semibold: '500', bold: '500' },
      colors: {
        marca: { DEFAULT: '#2563eb', 50: '#eff6ff', 100: '#dbeafe', 600: '#2563eb', 700: '#1d4ed8' },
        fundo: v('fundo'),
        superficie: v('superficie'),
        elevado: v('elevado'),
        borda: v('borda'),
        texto: v('texto'),
        suave: v('suave'),
        fraco: v('fraco'),
      },
    },
  },
  plugins: [],
};
