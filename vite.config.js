import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
    sourcemap: false,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'three',
              test: /[\\/]node_modules[\\/]three[\\/]/,
              priority: 20,
            },
            {
              name: 'motion',
              test: /[\\/]node_modules[\\/](gsap|lenis)[\\/]/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
});
