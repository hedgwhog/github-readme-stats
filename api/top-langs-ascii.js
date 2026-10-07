// api/top-langs-ascii.js — minimal monochrome language card
// /api/top-langs-ascii?username=NAME&langs_count=8
// Optional: &theme=auto|light|dark  &title=languages  &hide=html,css  &exclude_repo=a,b

import { fetchTopLanguages } from "../src/fetchers/top-languages.js";

const W = 400, PAD = 20, FS = 13, CH = 7.8, ROW = 26, CELL = 8, GAP = 2;
const FONT = "ui-monospace,SFMono-Regular,Menlo,Consolas,'DejaVu Sans Mono','Liberation Mono',monospace";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const style = (theme) => {
  const light = ".fg{fill:#1f2328}.mute{fill:#8c959f}.on{fill:#1f2328}.off{fill:#e6e8eb}";
  const dark = ".fg{fill:#e6edf3}.mute{fill:#7d8590}.on{fill:#e6edf3}.off{fill:#262c33}";
  if (theme === "light") return light.replace(/#1f2328/g, "#000");
  if (theme === "dark") return dark.replace(/#e6edf3/g, "#fff");
  return light + `@media (prefers-color-scheme:dark){${dark}}`;
};
const bg = (theme) => (theme === "light" ? "#fff" : theme === "dark" ? "#000" : "none");

const svg = (h, theme, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}" viewBox="0 0 ${W} ${h}">` +
  `<style>${style(theme)}text{font-family:${FONT};font-size:${FS}px}</style>` +
  `<rect width="100%" height="100%" rx="6" fill="${bg(theme)}"/>${body}</svg>`;

export default async (req, res) => {
  const { username, langs_count = "8", hide = "", exclude_repo = "", theme = "auto", title = "" } = req.query;
  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "public, max-age=14400, s-maxage=14400");

  try {
    if (!username) throw new Error("missing ?username=");
    const langs = await fetchTopLanguages(username, exclude_repo ? exclude_repo.split(",") : []);
    const hidden = hide.toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
    const n = Math.min(Math.max(parseInt(langs_count, 10) || 8, 1), 20);
    const list = Object.values(langs)
      .filter((l) => !hidden.includes(l.name.toLowerCase()))
      .sort((a, b) => b.size - a.size)
      .slice(0, n);
    const total = list.reduce((s, l) => s + l.size, 0) || 1;

    const nameW = Math.max(...list.map((l) => l.name.length), 6) * CH + 18;
    const pctW = 52;
    const barX = PAD + nameW;
    const cells = Math.floor((W - PAD * 2 - nameW - pctW + GAP) / (CELL + GAP));
    const top = title ? PAD + 30 : PAD;

    let body = title ? `<text class="mute" x="${PAD}" y="${PAD + 12}">${esc(title)}</text>` : "";
    list.forEach((l, i) => {
      const y = top + i * ROW + 14;
      const share = l.size / total;
      const on = share > 0 ? Math.max(1, Math.round(share * cells)) : 0;
      body += `<text class="fg" x="${PAD}" y="${y}">${esc(l.name)}</text>`;
      for (let c = 0; c < cells; c++) {
        body += `<rect class="${c < on ? "on" : "off"}" x="${barX + c * (CELL + GAP)}" y="${y - 9}" width="${CELL}" height="10" rx="1.5"/>`;
      }
      body += `<text class="mute" x="${W - PAD}" y="${y}" text-anchor="end">${(share * 100).toFixed(1)}%</text>`;
    });

    res.send(svg(top + list.length * ROW + PAD - 6, theme, body));
  } catch (err) {
    res.send(svg(56, theme, `<text class="mute" x="${PAD}" y="33">error: ${esc(err.message)}</text>`));
  }
};
