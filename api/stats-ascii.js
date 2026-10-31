// api/stats-ascii.js — ASCII stats card
// /api/stats-ascii?username=NAME
// Optional: &theme=auto|light|dark  &title=stats|none  &hide_rank=true

import { fetchStats } from "../src/fetchers/stats.js";

// ---------- shared ASCII renderer (same in top-langs-ascii.js) ----------
const COLS = 50, CH = 8.4, LH = 20, PAD = 14, FS = 14;
const FONT = "ui-monospace,SFMono-Regular,Menlo,Consolas,'DejaVu Sans Mono','Liberation Mono',monospace";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// colors follow the theme: light = dark text, dark = light text, auto = follows the viewer's color scheme
const css = (t) => {
  const L = { fg: "#1f2328", mute: "#59636e", dim: "#8c959f" };
  const D = { fg: "#f0f6fc", mute: "#9198a1", dim: "#656c76" };
  const rule = (c) => `.fg{fill:${c.fg}}.mute{fill:${c.mute}}.dim{fill:${c.dim}}`;
  if (t === "light") return rule(L);
  if (t === "dark") return rule(D);
  return rule(L) + `@media (prefers-color-scheme: dark){${rule(D)}}`;
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
// -------------------------------------------------------------------------

const num = (v) => (typeof v === "number" && !Number.isNaN(v) ? v.toLocaleString("en-US") : "-");

// resolves with `fallback` if the promise takes longer than `ms`
const withDeadline = (p, ms, fallback) =>
  Promise.race([p, new Promise((ok) => setTimeout(() => ok(fallback), ms))]);

// ---------- extra stats that the original project doesn't provide ----------
const gh = (url, opts = {}) =>
  fetch(url, {
    ...opts,
    headers: { Authorization: `bearer ${process.env.PAT_1}`, "User-Agent": "readme-stats-ascii", ...(opts.headers || {}) },
  });

const fetchExtra = async (username) => {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  // commits this month + list of your own (non-fork) repos
  const r = await gh("https://api.github.com/graphql", {
    method: "POST",
    body: JSON.stringify({
      query: `query($login:String!,$from:DateTime!,$to:DateTime!){
        user(login:$login){
          contributionsCollection(from:$from,to:$to){ totalCommitContributions restrictedContributionsCount }
          repositories(first:100, ownerAffiliations:OWNER, isFork:false){ nodes{ nameWithOwner } }
        }
      }`,
      variables: { login: username, from: monthStart.toISOString(), to: now.toISOString() },
    }),
  });
  const j = await r.json();
  if (j.errors || !j.data?.user) throw new Error(j.errors?.[0]?.message || "user not found");
  const user = j.data.user;

  // lines added / removed: summed from each repo's contributor statistics (default branch, all time)
  let added = 0, removed = 0, pending = false;
  await Promise.all(
    user.repositories.nodes.map(async ({ nameWithOwner }) => {
      try {
        // GitHub answers 202 while it calculates the numbers in the background: wait a moment and ask again
        let res;
        for (let tryNo = 0; tryNo < 2; tryNo++) {
          res = await gh(`https://api.github.com/repos/${nameWithOwner}/stats/contributors`);
          if (res.status !== 202) break;
          await new Promise((ok) => setTimeout(ok, 1500));
        }
        if (res.status === 202) { pending = true; return; }
        if (!res.ok || res.status === 204) return; // 204 = empty repo
        const data = await res.json();
        const me = Array.isArray(data) && data.find((c) => c.author?.login?.toLowerCase() === username.toLowerCase());
        if (me) for (const w of me.weeks) { added += w.a; removed += w.d; }
      } catch { /* skip repo */ }
    }),
  );

  return { commitsThisMonth: user.contributionsCollection.totalCommitContributions, added, removed, pending };
};
// -------------------------------------------------------------------------

export default async (req, res) => {
  const { username, theme = "auto", title = "stats", hide_rank = "false" } = req.query;
  res.setHeader("Content-Type", "image/svg+xml");
  try {
    if (!username) throw new Error("missing ?username=");

    // the extra stats get a 7s budget; if they're too slow we show "calculating..." and retry soon
    const [s, x] = await Promise.all([
      fetchStats(username, true, [], true),
      withDeadline(fetchExtra(username), 7000, { commitsThisMonth: 0, added: 0, removed: 0, pending: true }),
    ]);

    // GitHub computes line stats in the background the first time; retry soon if that's still happening
    res.setHeader("Cache-Control", x.pending ? "public, max-age=60, s-maxage=60" : "public, max-age=14400, s-maxage=14400");

    const items = [
      ["lines added", x.pending && !x.added ? "calculating..." : "+" + num(x.added)],
      ["lines removed", x.pending && !x.removed ? "calculating..." : "-" + num(x.removed)],
      ["commits (this month)", x.pending && !x.commitsThisMonth ? "calculating..." : num(x.commitsThisMonth)],
      ["commits (all time)", num(s.totalCommits)],
      ["pull requests", num(s.totalPRs)],
      ["merged", `${num(s.totalPRsMerged)} (${Math.round(s.mergedPRsPercentage || 0)}%)`],
      ["stars", num(s.totalStars)],
    ];
    if (hide_rank !== "true" && s.rank) items.push(["rank", s.rank.level]);

    const rows = items.map(([label, value]) => {
      const dots = COLS - 2 - (1 + label.length + 1 + 1 + value.length + 1);
      return [[" " + label + " ", "mute"], [".".repeat(Math.max(1, dots)), "dim"], [" " + value, "fg"]];
    });
    res.send(render(rows, title, theme));
  } catch (err) {
    res.setHeader("Cache-Control", "no-store");
    res.send(render([[[" error: " + String(err.message).slice(0, 40), "mute"]]], "error", theme));
  }
};
