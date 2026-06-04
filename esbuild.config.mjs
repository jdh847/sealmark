import esbuild from 'esbuild';
import process from 'process';
import builtins from 'builtin-modules';

const prod = process.argv[2] === 'production';

// opentimestamps is BUNDLED (it is our dependency). Node builtins it pulls in are left
// external and resolved at runtime by Electron's Node. Whether the bundle runs inside
// the Obsidian renderer is the remaining on-machine spike (ARCHITECTURE 9).
const context = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: ['obsidian', 'electron', ...builtins],
  format: 'cjs',
  target: 'es2018',
  platform: 'node',
  logLevel: 'info',
  sourcemap: prod ? false : 'inline',
  treeShaking: true,
  // Strip console.*/debugger from production bundles (Obsidian guideline: no
  // unnecessary logging). This also removes the opentimestamps library's own
  // console.log calls that would otherwise leak into users' dev console.
  drop: prod ? ['console', 'debugger'] : [],
  outfile: 'main.js',
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
