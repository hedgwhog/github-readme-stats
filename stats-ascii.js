// api/stats-ascii.js — minimal monochrome stats card
// /api/stats-ascii?username=NAME
// Optional: &theme=auto|light|dark  &title=stats  &include_all_commits=true  &hide_rank=true

import { fetchStats } from "../src/fetchers/stats.js";

const W = 400, PAD = 20, FS = 13, CH = 7.8;
const ROWS_H = 8 * 26; // same height as an 8-language card, so they sit nicely side by side
const FONT = "ui-monospace,SFMono-Regular,Menlo,Consolas,'DejaVu Sans Mono','Liberation Mono',monospace";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const style = (theme) => {
  const light = ".fg{fill:#1f2328}.mute{fill:#8c959f}.dot{stroke:#c4c9cf}";
  const dark = ".fg{fill:#e6edf3}.mute{fill:#7d8590}.dot{stroke:#3d444d}";
  if (theme === "light") return light.replace(/#1f2328/g, "#000");
  if (theme === "dark") return dark.replace(/#e6edf3/g, "#fff");
  return light + `@media (prefers-color-scheme:dark){${dark}}`;
};
const bg = (theme) => (theme === "light" ? "#fff" : theme === "dark" ? "#000" : "none");

const svg = (h, theme, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}" viewBox="0 0 ${W} ${h}">` +
  `<style>${style(theme)}text{font-family:${FONT};font-size:${FS}px}</style>` +
  `<rect width="100%" height="100%" rx="6" fill="${bg(theme)}"/>${body}</svg>`;

const num = (v) => (typeof v === "number" ? v.toLocaleString("en-US") : String(v ?? "–"));

export default async (req, res) => {
  const { username, theme = "auto", title = "", include_all_commits = "false", hide_rank = "false" } = req.query;
  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "public, max-age=14400, s-maxage=14400");

  try {
    if (!username) throw new Error("missing ?username=");
    const s = await fetchStats(username, include_all_commits === "true", [], true);

    const rows = [
      ["stars", num(s.totalStars)],
      [include_all_commits === "true" ? "commits" : "commits (year)", num(s.totalCommits)],
      ["pull requests", num(s.totalPRs)],
      ["merged", `${num(s.totalPRsMerged)} (${Math.round(s.mergedPRsPercentage || 0)}%)`],
      ["issues", num(s.totalIssues)],
      ["contributed to", num(s.contributedTo)],
    ];
    if (hide_rank !== "true" && s.rank) rows.push(["rank", s.rank.level]);

    const ROW = ROWS_H / rows.length;
    const top = title ? PAD + 30 : PAD;
    let body = title ? `<text class="mute" x="${PAD}" y="${PAD + 12}">${esc(title)}</text>` : "";
    rows.forEach(([label, value], i) => {
      const y = top + i * ROW + 14;
      const x1 = PAD + label.length * CH + 10;
      const x2 = W - PAD - value.length * CH - 10;
      body += `<text class="mute" x="${PAD}" y="${y}">${esc(label)}</text>`;
      if (x2 > x1) body += `<line class="dot" x1="${x1}" y1="${y - 4}" x2="${x2}" y2="${y - 4}" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="0 6"/>`;
      body += `<text class="fg" x="${W - PAD}" y="${y}" text-anchor="end" xml:space="preserve">${esc(value)}</text>`;
    });

    res.send(svg(top + ROWS_H + PAD - 6, theme, body));
  } catch (err) {
    res.send(svg(56, theme, `<text class="mute" x="${PAD}" y="33">error: ${esc(err.message)}</text>`));
  }
};
