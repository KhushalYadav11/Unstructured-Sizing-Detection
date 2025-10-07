import { defineConfig } from 'vite';

export default defineConfig({
  css: {
    postcss: {
      from: undefined,  // Also helps suppress the warning
    },
  },
});
