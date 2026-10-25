#!/usr/bin/env tsx
/**
 * Generates the placeholder illustrations used by seeded demonstration
 * listings. They are drawn here rather than downloaded, so the repository has
 * no third-party image licensing question and no broken image URLs. Each one
 * says "Example illustration" on its face so it is never mistaken for a
 * photograph of a real item.
 */
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "public", "items");

const INK = "#1b2a23";
const PAPER = "#f7f5ef";
const FOREST = "#1f5137";
const MINT = "#bfe3cd";
const LIME = "#9fd356";
const STEEL = "#5d6b64";

type Drawing = { slug: string; title: string; body: string };

const frame = (body: string, title: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480" width="640" height="480" role="img" aria-label="Example illustration: ${title}">
  <rect width="640" height="480" fill="${PAPER}"/>
  <g>${body}</g>
  <g>
    <rect x="16" y="430" width="226" height="30" rx="15" fill="${FOREST}" opacity="0.92"/>
    <text x="30" y="450" font-family="ui-sans-serif, system-ui, sans-serif" font-size="14" font-weight="600" fill="${PAPER}">Example illustration</text>
  </g>
  <text x="624" y="450" text-anchor="end" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13" fill="${STEEL}">${title}</text>
</svg>
`;

const drawings: Drawing[] = [
  {
    slug: "monitor-24",
    title: "24-inch monitor",
    body: `
      <rect x="110" y="70" width="420" height="250" rx="12" fill="${INK}"/>
      <rect x="124" y="84" width="392" height="206" rx="6" fill="${MINT}"/>
      <rect x="124" y="84" width="392" height="206" rx="6" fill="url(#g1)" opacity="0.5"/>
      <defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.75"/><stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
      </linearGradient></defs>
      <rect x="296" y="320" width="48" height="52" fill="${STEEL}"/>
      <rect x="236" y="368" width="168" height="16" rx="8" fill="${INK}"/>
      <circle cx="320" cy="302" r="4" fill="${LIME}"/>`,
  },
  {
    slug: "monitor-27",
    title: "27-inch monitor",
    body: `
      <rect x="80" y="54" width="480" height="276" rx="14" fill="#232f2a"/>
      <rect x="94" y="68" width="452" height="232" rx="6" fill="#cfe8da"/>
      <rect x="290" y="330" width="60" height="46" fill="${STEEL}"/>
      <rect x="214" y="372" width="212" height="18" rx="9" fill="#232f2a"/>
      <circle cx="320" cy="312" r="4" fill="${LIME}"/>`,
  },
  {
    slug: "monitor-pair",
    title: "Pair of monitors",
    body: `
      <rect x="40" y="110" width="270" height="170" rx="10" fill="${INK}"/>
      <rect x="52" y="122" width="246" height="134" rx="5" fill="${MINT}"/>
      <rect x="150" y="280" width="50" height="38" fill="${STEEL}"/>
      <rect x="110" y="314" width="130" height="14" rx="7" fill="${INK}"/>
      <rect x="330" y="110" width="270" height="170" rx="10" fill="${INK}"/>
      <rect x="342" y="122" width="246" height="134" rx="5" fill="#cfe8da"/>
      <rect x="440" y="280" width="50" height="38" fill="${STEEL}"/>
      <rect x="400" y="314" width="130" height="14" rx="7" fill="${INK}"/>`,
  },
  {
    slug: "keyboard-mouse",
    title: "Keyboard and mouse",
    body: `
      <rect x="70" y="180" width="380" height="130" rx="12" fill="#2b3833"/>
      ${Array.from({ length: 5 }, (_, r) =>
        Array.from({ length: 14 }, (_, c) =>
          `<rect x="${86 + c * 26}" y="${196 + r * 22}" width="20" height="16" rx="3" fill="#48574f"/>`,
        ).join(""),
      ).join("")}
      <path d="M480 300 q60 -10 70 -70 q6 -42 -34 -44 q-40 -2 -44 42 q-4 50 8 72 z" fill="#2b3833"/>
      <rect x="512" y="196" width="4" height="30" rx="2" fill="${LIME}"/>`,
  },
  {
    slug: "mini-pc",
    title: "Small desktop computer",
    body: `
      <rect x="180" y="110" width="280" height="240" rx="12" fill="#39443e"/>
      <rect x="196" y="126" width="248" height="24" rx="4" fill="#222b26"/>
      <circle cx="216" cy="330" r="10" fill="${LIME}"/>
      <rect x="240" y="300" width="60" height="8" rx="4" fill="#5d6b64"/>
      <rect x="240" y="320" width="60" height="8" rx="4" fill="#5d6b64"/>
      <rect x="340" y="296" width="90" height="42" rx="6" fill="#222b26"/>`,
  },
  {
    slug: "projector",
    title: "Portable projector",
    body: `
      <rect x="150" y="170" width="300" height="140" rx="18" fill="#3b4741"/>
      <circle cx="420" cy="240" r="42" fill="#222b26"/>
      <circle cx="420" cy="240" r="28" fill="${MINT}"/>
      <circle cx="420" cy="240" r="12" fill="#ffffff" opacity="0.8"/>
      <rect x="176" y="196" width="120" height="12" rx="6" fill="#5d6b64"/>
      <rect x="176" y="222" width="80" height="12" rx="6" fill="#5d6b64"/>
      <circle cx="190" cy="288" r="8" fill="${LIME}"/>`,
  },
  {
    slug: "dock",
    title: "Laptop docking station",
    body: `
      <rect x="160" y="200" width="320" height="80" rx="14" fill="#333f39"/>
      ${Array.from({ length: 6 }, (_, i) => `<rect x="${186 + i * 48}" y="${228}" width="30" height="14" rx="4" fill="#1c2420"/>`).join("")}
      <rect x="160" y="282" width="320" height="10" rx="5" fill="#222b26"/>
      <circle cx="176" cy="216" r="5" fill="${LIME}"/>`,
  },
  {
    slug: "switch",
    title: "Network switch",
    body: `
      <rect x="110" y="190" width="420" height="100" rx="10" fill="#2f3a35"/>
      ${Array.from({ length: 12 }, (_, i) => `<rect x="${134 + i * 32}" y="${222}" width="22" height="20" rx="3" fill="#161d19"/>`).join("")}
      ${Array.from({ length: 12 }, (_, i) => `<circle cx="${145 + i * 32}" cy="${258}" r="3" fill="${LIME}" opacity="${i % 3 ? 0.35 : 1}"/>`).join("")}
      <rect x="110" y="290" width="420" height="8" rx="4" fill="#1c2420"/>`,
  },
  {
    slug: "webcam",
    title: "USB webcam",
    body: `
      <rect x="250" y="170" width="140" height="90" rx="40" fill="#303b36"/>
      <circle cx="320" cy="215" r="30" fill="#161d19"/>
      <circle cx="320" cy="215" r="18" fill="#2a4a3b"/>
      <circle cx="312" cy="207" r="5" fill="#ffffff" opacity="0.7"/>
      <path d="M320 260 l0 40" stroke="#303b36" stroke-width="10" stroke-linecap="round"/>
      <path d="M280 310 q40 -22 80 0" stroke="#303b36" stroke-width="12" fill="none" stroke-linecap="round"/>`,
  },
  {
    slug: "desk-chair",
    title: "Office task chair",
    body: `
      <rect x="250" y="110" width="140" height="120" rx="16" fill="#3a4842"/>
      <rect x="236" y="246" width="168" height="36" rx="12" fill="#45554e"/>
      <rect x="312" y="282" width="16" height="60" fill="#5d6b64"/>
      <path d="M250 352 l70 -14 l70 14" stroke="#5d6b64" stroke-width="10" fill="none" stroke-linecap="round"/>
      <circle cx="250" cy="358" r="8" fill="#222b26"/>
      <circle cx="390" cy="358" r="8" fill="#222b26"/>`,
  },
  {
    slug: "monitor-cracked",
    title: "Monitor with damaged panel",
    body: `
      <rect x="110" y="70" width="420" height="250" rx="12" fill="${INK}"/>
      <rect x="124" y="84" width="392" height="206" rx="6" fill="#b9c4bd"/>
      <path d="M200 100 l90 80 l-40 30 l120 70" stroke="#2b3833" stroke-width="3" fill="none"/>
      <path d="M290 180 l120 -40 M250 210 l-80 50" stroke="#2b3833" stroke-width="2" fill="none"/>
      <rect x="296" y="320" width="48" height="52" fill="${STEEL}"/>
      <rect x="236" y="368" width="168" height="16" rx="8" fill="${INK}"/>`,
  },
  {
    slug: "monitor-ultrawide",
    title: "Ultrawide monitor",
    body: `
      <rect x="40" y="130" width="560" height="170" rx="12" fill="#232f2a"/>
      <rect x="54" y="144" width="532" height="128" rx="5" fill="#c9e4d6"/>
      <rect x="296" y="300" width="48" height="44" fill="${STEEL}"/>
      <rect x="226" y="340" width="188" height="16" rx="8" fill="#232f2a"/>`,
  },
];

fs.mkdirSync(OUT, { recursive: true });
for (const d of drawings) {
  fs.writeFileSync(path.join(OUT, `${d.slug}.svg`), frame(d.body, d.title));
}
console.log(`wrote ${drawings.length} illustrations to public/items/`);
