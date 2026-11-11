// Generates every app icon in public/icons from the SVG sources below.
// Run with: npm run icons
import { Resvg } from "@resvg/resvg-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const out = fileURLToPath(new URL("../public/icons/", import.meta.url));
mkdirSync(out, { recursive: true });

const background = (rx) => `
  <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#285d4d"/><stop offset="1" stop-color="#1b362f"/>
  </linearGradient></defs>
  <rect width="512" height="512" rx="${rx}" fill="url(#bg)"/>`;

const pantry = `
  <rect x="86" y="394" width="340" height="18" rx="9" fill="#efa867"/>
  <rect x="102" y="262" width="104" height="132" rx="12" fill="#d7975e"/>
  <rect x="102" y="286" width="104" height="10" fill="#e0aa76"/>
  <rect x="102" y="360" width="104" height="10" fill="#e0aa76"/>
  <rect x="96" y="250" width="116" height="22" rx="8" fill="#f0ddaf"/>
  <rect x="232" y="130" width="148" height="40" rx="12" fill="#dfc58f"/>
  <rect x="214" y="160" width="184" height="234" rx="36" fill="#faf8f0"/>
  <rect x="214" y="230" width="184" height="98" fill="#e0ebda"/>
  <path d="M278 279l20 20 40-42" fill="none" stroke="#203f37" stroke-width="18"
    stroke-linecap="round" stroke-linejoin="round"/>`;

// Jar only, larger, so it stays readable at 16-32px.
const jar = `
  <rect x="150" y="76" width="212" height="62" rx="18" fill="#dfc58f"/>
  <rect x="112" y="122" width="288" height="324" rx="56" fill="#faf8f0"/>
  <rect x="112" y="220" width="288" height="136" fill="#e0ebda"/>
  <path d="M196 290l38 38 82-82" fill="none" stroke="#203f37" stroke-width="34"
    stroke-linecap="round" stroke-linejoin="round"/>`;

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${body}</svg>`;
const scaled = (scale, body) =>
  `<g transform="translate(256 268) scale(${scale}) translate(-256 -268)">${body}</g>`;

const icons = {
  any: svg(background(112) + pantry),
  // Full-bleed artwork kept inside the 80% maskable safe zone.
  maskable: svg(background(0) + scaled(0.78, pantry)),
  // iOS rounds the corners itself and needs an opaque square.
  apple: svg(background(0) + scaled(0.88, pantry)),
  small: svg(background(96) + jar),
};

// Shortcut glyphs reuse the 24px tab icons from index.html.
const glyphs = {
  add: `<path d="m3 7 9-4 9 4-9 4-9-4Z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/>
    <circle cx="18.5" cy="18.5" r="4.5" fill="#efa867" stroke="#e0ebda" stroke-width="1.6"/>
    <path d="M18.5 16.5v4m-2-2h4" stroke="#203f37" stroke-width="1.6"/>`,
  stock: `<path d="m3 7 9-4 9 4-9 4-9-4Z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/>`,
  shopping: `<path d="M2 3h2l3 12h12l3-9H5"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>`,
  meals: `<path d="M3 11h18"/><path d="M5 11v6a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-6"/>
    <path d="M12 3v4"/><path d="M7 4l2 3"/><path d="m17 4-2 3"/>`,
};
const shortcut = (glyph) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <rect width="96" height="96" fill="#e0ebda"/>
  <g transform="translate(24 24) scale(2)" fill="none" stroke="#203f37" stroke-width="1.8"
    stroke-linecap="round" stroke-linejoin="round">${glyph}</g></svg>`;

const png = (source, size) =>
  new Resvg(source, { fitTo: { mode: "width", value: size } }).render().asPng();
const write = (name, data) => writeFileSync(resolve(out, name), data);

write("icon.svg", icons.small);
write("icon-192.png", png(icons.any, 192));
write("icon-512.png", png(icons.any, 512));
write("icon-maskable-192.png", png(icons.maskable, 192));
write("icon-maskable-512.png", png(icons.maskable, 512));
write("apple-touch-icon.png", png(icons.apple, 180));
for (const [name, glyph] of Object.entries(glyphs))
  write(`shortcut-${name}.png`, png(shortcut(glyph), 96));

// favicon.ico holding PNG-encoded 16, 32 and 48px images.
const images = [16, 32, 48].map((size) => [size, png(icons.small, size)]);
const header = Buffer.alloc(6 + images.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
let offset = header.length;
images.forEach(([size, data], index) => {
  const entry = 6 + index * 16;
  header.writeUInt8(size, entry);
  header.writeUInt8(size, entry + 1);
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(data.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += data.length;
});
writeFileSync(
  resolve(out, "../favicon.ico"),
  Buffer.concat([header, ...images.map(([, data]) => data)]),
);
console.log("Generated icons in public/icons");
