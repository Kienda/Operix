// Writes the static OPERIX brand files in public/brand from one geometry source,
// then rasterizes the PNG app icons with the installed browser (Playwright).
//   node scripts/build-brand-assets.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const TEAL = '#0D9488';
const TEAL_ON_DARK = '#14B8A6';
const NAVY = '#0F172A';
const GOLD = '#F4B942';
const SUBTITLE = 'A GLOBAL HIGH TECH PRODUCT';

const letters = (fill, accent) => `<g fill="${fill}">
    <path fill-rule="evenodd" d="M0 50a56 50 0 1 0 112 0a56 50 0 1 0-112 0ZM24 50a32 26 0 1 0 64 0a32 26 0 1 0-64 0Z"/>
    <rect x="124" width="24" height="100"/>
    <rect x="220" width="24" height="100"/><rect x="220" width="68" height="24"/>
    <rect x="220" y="38" width="62" height="24"/><rect x="220" y="76" width="68" height="24"/>
    <rect x="302" width="24" height="100"/><path d="M336 64h28l26 36h-28Z"/>
    <rect x="404" width="24" height="100"/>
    <path d="M442 0h32l72 100h-32Z"/><path d="M442 100h32l44.64-62h-32Z"/>
  </g>
  <g fill="none" stroke="${fill}" stroke-width="24">
    <path d="M136 12h32a26 26 0 0 1 0 52h-32"/><path d="M314 12h32a26 26 0 0 1 0 52h-32"/>
  </g>
  <path fill="${accent}" d="M490.24 33h32l23.76-33h-32Z"/>`;

const svg = (viewBox, body, label) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="${label}">\n  ${body}\n</svg>\n`;

const subtitle = (fill) =>
  `<text x="0" y="130" textLength="546" lengthAdjust="spacing" fill="${fill}" font-family="Montserrat, 'Segoe UI', Arial, sans-serif" font-weight="600" font-size="21">${SUBTITLE}</text>`;

const mark = ({ framed = true, mono = false } = {}) => {
  const ink = mono ? 'currentColor' : null;
  return [
    framed && !mono
      ? `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#15253F"/><stop offset="1" stop-color="${NAVY}"/></linearGradient></defs>
  <rect width="64" height="64" rx="14" fill="url(#g)"/>`
      : '',
    mono
      ? `<path fill="${ink}" fill-rule="evenodd" d="M11 37a17 17 0 1 0 34 0a17 17 0 1 0-34 0ZM20 37a8 8 0 1 0 16 0a8 8 0 1 0-16 0Z"/>`
      : `<circle cx="28" cy="37" r="17" fill="#FFFFFF"/><circle cx="28" cy="37" r="8.5" fill="${TEAL}"/>`,
    `<path d="M38.5 26.5 46.5 18.5" stroke="${ink ?? GOLD}" stroke-width="6" stroke-linecap="square" fill="none"/>`,
    `<path d="M54 11 40 13.5 51.5 25Z" fill="${ink ?? GOLD}"/>`,
  ]
    .filter(Boolean)
    .join('\n  ');
};

const files = {
  'operix-wordmark.svg': svg('0 0 546 100', letters(TEAL, GOLD), 'Operix'),
  'operix-wordmark-on-dark.svg': svg('0 0 546 100', letters(TEAL_ON_DARK, GOLD), 'Operix'),
  'operix-wordmark-mono.svg': svg('0 0 546 100', letters('currentColor', 'currentColor'), 'Operix'),
  'operix-lockup.svg': svg('0 0 546 132', `${letters(TEAL, GOLD)}\n  ${subtitle(NAVY)}`, 'Operix — a Global High Tech product'),
  'operix-lockup-on-dark.svg': svg('0 0 546 132', `${letters(TEAL_ON_DARK, GOLD)}\n  ${subtitle('#CBD5E1')}`, 'Operix — a Global High Tech product'),
  'operix-icon.svg': svg('0 0 64 64', mark(), 'Operix'),
  'operix-mark.svg': svg('0 0 64 64', mark({ framed: false }), 'Operix'),
  'operix-mark-mono.svg': svg('0 0 64 64', mark({ mono: true }), 'Operix'),
};

mkdirSync('public/brand', { recursive: true });
for (const [name, content] of Object.entries(files)) writeFileSync(`public/brand/${name}`, content);
writeFileSync('public/favicon.svg', files['operix-icon.svg']);

// PNG app icons. Maskable icons need a full-bleed background, so they get a square tile.
const pngs = [
  ['public/apple-touch-icon.png', 180, false],
  ['public/brand/operix-icon-192.png', 192, false],
  ['public/brand/operix-icon-512.png', 512, false],
  ['public/brand/operix-icon-maskable-512.png', 512, true],
  ['public/favicon-32.png', 32, false],
];
const browser = await chromium.launch(process.env.CI ? {} : { channel: process.env.PW_CHANNEL ?? 'msedge' });
const page = await browser.newPage();
for (const [path, size, maskable] of pngs) {
  const icon = maskable
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-12 -12 88 88"><rect x="-12" y="-12" width="88" height="88" fill="${NAVY}"/>${mark({ framed: false })}</svg>`
    : files['operix-icon.svg'];
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${icon.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`,
  );
  await page.screenshot({ path, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}
await browser.close();
console.log(`brand assets: ${Object.keys(files).length} SVG + ${pngs.length} PNG`);
