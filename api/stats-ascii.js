// api/stats-ascii.js — ASCII stats card
// /api/stats-ascii?username=NAME
// Optional: &theme=auto|light|dark  &title=stats|none  &include_all_commits=true  &hide_rank=true

import { fetchStats } from "../src/fetchers/stats.js";

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

// Veilig ingestelde matchAll regex
const seg = (col, row, str, cls) => {
  let out = "";
  const y = PAD + row * LH + 14;
  for (const m of str.matchAll(\(/\S+/\)g)) {
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
  return `<svg xmlns="http://w3.org" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<style>${css(theme)}text{font-family:${FONT};font-size:${FS}px}</style>` +
    `<rect width="100%" height="100%" rx="6" fill="${bg}"/>${out}</svg>`;
};
// -------------------------------------------------------------------
// GEOPTIMALISEERD: Deze functie crasht nu nooit meer bij missende data
const num = (v) => {
  if (typeof v === "number") return v.toLocaleString("en-US");
  if (typeof v === "string" && v.trim() !== "") return v;
  return "-";
};

export default async (req, res) => {
  const { username, theme = "auto", title = "stats", hide_rank = "false" } = req.query;
  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "public, max-age=14400, s-maxage=14400");
  try {
    if (!username) throw new Error("missing ?username=");
    
    // Roep de fetcher aan
    const s = await fetchStats(username, true, [], true) || {};
    
    // Veilig data uitlezen zonder runtime crashes veroorzaken
    const items = [
      ["stars", num(s.totalStars)],
      ["commits (this month)", num(s.commitsThisMonth ?? s.monthlyCommits)],
      ["pull requests", num(s.totalPRs)],
      ["merged", `${num(s.totalPRsMerged)} (${Math.round(s.mergedPRsPercentage || 0)}%)`],
      ["lines of code added", num(s.linesAdded ?? s.additions)],
      ["lines of code removed", num(s.linesRemoved ?? s.deletions)],
      ["commits (all-time)", num(s.totalCommits)],
    ];
    if (hide_rank !== "true" && s.rank) items.push(["rank", s.rank.level]);

    const rows = items.map(([label, value]) => {
      const dots = COLS - 2 - (1 + label.length + 1 + 1 + value.length + 1);
      return [[" " + label + " ", "mute"], [".".repeat(Math.max(1, dots)), "dim"], [" " + value, "fg"]];
    });
    res.send(render(rows, title, theme));
  } catch (err) {
    res.send(render([[[" error: " + err.message.slice(0, 40), "mute"]]], "error", theme));
  }
};
