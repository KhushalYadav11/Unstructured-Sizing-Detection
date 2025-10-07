const tailwindcss = require('tailwindcss');
const autoprefixer = require('autoprefixer');

module.exports = {
  from: undefined,  // This line suppresses the warning
  plugins: [
    tailwindcss(),
    autoprefixer(),
  ],
};
