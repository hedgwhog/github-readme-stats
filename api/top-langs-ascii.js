// api/top-langs-ascii.js
// ASCII-style "Most Used Languages" card for a github-readme-stats fork.
// Usage: /api/top-langs-ascii?username=hedgwhog&langs_count=8
// Optional: &dark=true (white on black), &hide=html,css, &exclude_repo=repo1,repo2

import { fetchTopLanguages } from "../src/fetchers/top-languages-fetcher.js";

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const svgWrap = (w, h, bg, fg, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
  `<rect width="100%" height="100%" fill="${bg}"/>` +
  `<g fill="${fg}" font-family="'DejaVu Sans Mono','Courier New',Menlo,Consolas,monospace" ` +
  `font-size="14" xml:space="preserve">${body}</g></svg>`;

export default async (req, res) => {
  const {
    username,
    langs_count = "8",
    hide = "",
    exclude_repo = "",
    dark = "false",
  } = req.query;

  const isDark = dark === "true";
  const bg = isDark ? "#000000" : "#ffffff";
  const fg = isDark ? "#ffffff" : "#000000";

  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "public, max-age=14400, s-maxage=14400");

  try {
    if (!username) throw new Error("Missing ?username=");

    const langs = await fetchTopLanguages(
      username,
      exclude_repo ? exclude_repo.split(",").map((s) => s.trim()) : [],
    );

    const hidden = hide
      .toLowerCase()
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const count = Math.min(Math.max(parseInt(langs_count, 10) || 8, 1), 20);
    const list = Object.values(langs)
      .filter((l) => !hidden.includes(l.name.toLowerCase()))
      .sort((a, b) => b.size - a.size)
      .slice(0, count);

    const total = list.reduce((s, l) => s + l.size, 0) || 1;

    // Layout
    const BAR = 24;
    const NAME = Math.max(10, ...list.map((l) => l.name.length));
    const W = 2 + NAME + 2 + BAR + 2 + 6 + 2; // inner width between │ │

    const title = "─ Most Used Languages ";
    const tag = ` @${username} `;
    const lines = [];
    lines.push("┌" + title + "─".repeat(Math.max(0, W - title.length)) + "┐");
    lines.push("│" + " ".repeat(W) + "│");
    for (const l of list) {
      const share = l.size / total;
      const filled = Math.round(share * BAR);
      const bar = "█".repeat(filled) + "░".repeat(BAR - filled);
      const pct = ((share * 100).toFixed(1) + "%").padStart(6);
      lines.push("│  " + l.name.padEnd(NAME) + "  " + bar + "  " + pct + "  │");
    }
    lines.push("│" + " ".repeat(W) + "│");
    lines.push(
      "└" + "─".repeat(Math.max(0, W - tag.length - 3)) + tag + "───" + "┘",
    );

    // SVG sizing: textLength keeps every line the same width so the box stays aligned
    const charW = 8.4, lineH = 18, pad = 16;
    const lineW = ((W + 2) * charW).toFixed(1);
    const width = Math.ceil((W + 2) * charW + pad * 2);
    const height = lines.length * lineH + pad * 2;

    const body = lines
      .map(
        (ln, i) =>
          `<text x="${pad}" y="${pad + (i + 1) * lineH - 4}" textLength="${lineW}" ` +
          `lengthAdjust="spacingAndGlyphs">${esc(ln)}</text>`,
      )
      .join("");

    res.send(svgWrap(width, height, bg, fg, body));
  } catch (err) {
    res.send(
      svgWrap(420, 50, bg, fg, `<text x="16" y="30">Error: ${esc(err.message)}</text>`),
    );
  }
};
