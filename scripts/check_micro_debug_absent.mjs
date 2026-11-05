#!/usr/bin/env node
/**
 * The self-study readout must not ship (`scripts/check_micro_debug_absent.mjs`,
 * `npm run check:micro-debug`).
 *
 * `MicroDebugReadout` is imported only behind `import.meta.env.VITE_MICRO_DEBUG`, so a production
 * build should fold the branch and never emit the module or its copy. A build check is the only
 * honest proof: a source search cannot see what Vite did. The strings below are the module's own
 * words, not a guess at a minified name.
 *
 * Usage
 *     npm run check:micro-debug
 *
 * Exit-code family: typed
 *     0  no debug readout in the built assets
 *     1  the readout or its switch survived the production build
 *     2  there is no dist/ build to inspect
 */

import fs from 'node:fs';
import path from 'node:path';

const DIST = path.join(process.cwd(), 'dist');
const NEEDLES = [
  'VITE_MICRO_DEBUG',
  'MicroDebugReadout',
  'local timing evidence',
  'micro-debug',
];

if (!fs.existsSync(path.join(DIST, 'assets'))) {
  console.error('[FAIL] no dist/assets; run `npm run build` first');
  process.exit(2);
}

const hits = [];
const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(js|css|html)$/.test(entry.name)) {
      const text = fs.readFileSync(full, 'utf8');
      for (const needle of NEEDLES) {
        if (text.includes(needle)) hits.push(`${path.relative(DIST, full)} contains ${needle}`);
      }
    }
  }
};

walk(DIST);

if (hits.length > 0) {
  console.error('[FAIL] the micro debug readout is in the production bundle:');
  for (const hit of hits) console.error(`  ${hit}`);
  process.exit(1);
}

console.log('ok micro debug readout is absent from dist');
