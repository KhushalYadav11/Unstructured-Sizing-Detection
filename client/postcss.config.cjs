const tailwindcss = require("tailwindcss");
const autoprefixer = require("autoprefixer");

module.exports = {
  from: undefined,
  plugins: [tailwindcss(), autoprefixer()],
};
