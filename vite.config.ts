// npm run build        -> dist/: the folder build, for shipping (itch.io, a website)
// npm run build:single -> dist-single/index.html: one file with everything
//                         inlined, which every check opens from disk
// npm run build:test   -> dist-test/index.html: the same single file with every
//                         country open, to try one without playing those before
// Vitest reads the test block; Playwright has its own config.
import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig(({ mode }) => {
  const single = mode === 'single' || mode === 'open-all';
  return {
  // Relative paths, so the build works from any folder, itch.io included.
  base: './',
  // Assets are imported in the code (new URL('../assets/x.png', import.meta.url)),
  // so Vite hashes them and the single file inlines them. A public folder would
  // not be inlined, so there is none.
  publicDir: false,
  plugins: single ? [viteSingleFile()] : [],
  define: mode === 'open-all' ? { 'import.meta.env.VITE_OPEN_ALL': JSON.stringify('1') } : {},
  // The game's page only: other pages in the project (one-shots in prototypes/)
  // are not scanned for packages.
  optimizeDeps: { entries: ['index.html'] },
  build: {
    outDir: mode === 'open-all' ? 'dist-test' : single ? 'dist-single' : 'dist',
    emptyOutDir: true,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
  },
  };
});
