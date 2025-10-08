// Suppress PostCSS warnings about missing 'from' option
const originalConsoleWarn = console.warn;
console.warn = function(...args) {
  if (args[0] && typeof args[0] === 'string' && args[0].includes('PostCSS plugin did not pass the `from` option')) {
    return;
  }
  originalConsoleWarn.apply(console, args);
};

module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}