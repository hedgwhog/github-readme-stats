// api/top-langs-ascii.js — ASCII language card
// /api/top-langs-ascii?username=NAME&langs_count=8
// Optional: &theme=auto|light|dark  &title=languages|none  &hide=html,css  &exclude_repo=a,b

import { fetchTopLanguages } from "../src/fetchers/top-languages.js";

// ---------- shared ASCII renderer (same in stats-ascii.js) ----------
const COLS = 50, CH = 8.4, LH = 20, PAD = 14, FS = 14;
const FONT = "ui-monospace,SFMono-Regular,Menlo,Consolas,'DejaVu Sans Mono','Liberation Mono',monospace";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const css = (t) => {
  const L = ".fg{fill:#1f2328}.mute{fill:#8c959f}.dim{fill:#c4c9cf}";
  const D = ".fg{fill:#e6edf3}.mute{fill:#7d8590}.dim{fill:#3d444d}";
  if (t === "light") return L.replace("#1f2328", "#000");
  if (t === "dark") return D.replace("#e6edf3", "#fff");
  return L + `@media (prefers-color-scheme:dark){${D}}`;
};
// Every character is placed on a fixed grid, so the box always lines up, whatever font GitHub uses.
const seg = (col, row, str, cls) => {
  let out = "";
  const y = PAD + row * LH + 14;
  // each run of non-space characters gets its own element, pinned to its column and stretched to exact width
  for (const m of str.matchAll(/\S+/g)) {
    const x = (PAD + (col + m.index) * CH).toFixed(1);
    const len = [...m[0]].length;
    out += `<text class="${cls}" x="${x}" y="${y}" textLength="${(len * CH).toFixed(1)}" lengthAdjust="spacingAndGlyphs">${esc(m[0])}</text>`;
  }
  return out;
};
// rows: array of arrays of [text, class]; wrapped in a +---+ box
const render = (rows, title, theme) => {
  const inner = COLS - 2;
  const t = title && title !== "none" ? `- ${title} ` : "";
  let out = seg(0, 0, "+-" + " ".repeat(Math.max(0, t.length - 1)) + "-".repeat(inner - t.length) + "+", "dim");
  if (t) out += seg(3, 0, title, "mute");
  const all = [[], ...rows, []];
  all.forEach((parts, r) => {
    out += seg(0, r + 1, "|", "dim") + seg(COLS - 1, r + 1, "|", "dim");
    let c = 1;
    for (const [txt, cls] of parts) { out += seg(c, r + 1, txt, cls); c += [...txt].length; }
  });
  out += seg(0, all.length + 1, "+" + "-".repeat(inner) + "+", "dim");
  const w = Math.ceil(PAD * 2 + COLS * CH), h = PAD * 2 + (all.length + 2) * LH;
  const bg = theme === "light" ? "#fff" : theme === "dark" ? "#000" : "none";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<style>${css(theme)}text{font-family:${FONT};font-size:${FS}px}</style>` +
    `<rect width="100%" height="100%" rx="6" fill="${bg}"/>${out}</svg>`;
};
// --------------------------------------------------------------------

export default async (req, res) => {
  const { username, langs_count = "8", hide = "", exclude_repo = "", theme = "auto", title = "languages" } = req.query;
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

    const NAME = Math.min(Math.max(...list.map((l) => l.name.length), 6), 16);
    const BAR = COLS - 2 - (1 + NAME + 2 + 2 + 1 + 5 + 1);
    const rows = list.map((l) => {
      const share = l.size / total;
      const on = share > 0 ? Math.max(1, Math.round(share * BAR)) : 0;
      const name = l.name.length > NAME ? l.name.slice(0, NAME - 1) + "~" : l.name.padEnd(NAME);
      return [
        [" " + name + "  ", "fg"], ["[", "dim"], ["#".repeat(on), "fg"], [".".repeat(BAR - on), "dim"], ["]", "dim"],
        [" " + ((share * 100).toFixed(1) + "%").padStart(5), "mute"],
      ];
    });
    res.send(render(rows, title, theme));
  } catch (err) {
    res.send(render([[[" error: " + err.message.slice(0, 40), "mute"]]], "error", theme));
  }
};
