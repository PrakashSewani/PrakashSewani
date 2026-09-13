#!/usr/bin/env node
// Generates assets/stats.svg for the profile README.
// Reads public data only, with no third-party image services and no secrets in the output.

import { writeFile } from 'node:fs/promises';

const USER = process.env.STATS_USER ?? 'PrakashSewani';
const TOKEN = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
const OUT = process.env.STATS_OUT ?? 'assets/stats.svg';

if (!TOKEN) {
  console.error('Missing GITHUB_TOKEN (or GH_TOKEN).');
  process.exit(1);
}

const graphql = async (query, variables) => {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${TOKEN}`,
      'content-type': 'application/json',
      'user-agent': `${USER}-profile-stats`,
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  if (body.errors) throw new Error(JSON.stringify(body.errors));
  return body.data;
};

const rest = async (path) => {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      authorization: `Bearer ${TOKEN}`,
      accept: 'application/vnd.github+json',
      'user-agent': `${USER}-profile-stats`,
    },
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${res.statusText}`);
  return res.json();
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const BAR_LEVELS = ['#1f2937', '#78350f', '#b45309', '#f59e0b', '#fbbf24'];

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function collect() {
  const { user } = await graphql(
    `query ($login: String!) {
      user(login: $login) {
        followers { totalCount }
        contributionsCollection {
          totalCommitContributions
          totalPullRequestContributions
          totalRepositoriesWithContributedCommits
          contributionCalendar {
            totalContributions
            weeks { contributionDays { contributionCount date } }
          }
        }
      }
    }`,
    { login: USER },
  );

  const repos = await rest(`/users/${USER}/repos?per_page=100&type=owner`);
  const owned = repos.filter((r) => !r.fork && !r.archived);
  const calendar = user.contributionsCollection.contributionCalendar;

  const weeks = calendar.weeks.map((week) => ({
    total: week.contributionDays.reduce((sum, day) => sum + day.contributionCount, 0),
    firstDay: week.contributionDays[0].date,
  }));

  return {
    contributions: calendar.totalContributions,
    commits: user.contributionsCollection.totalCommitContributions,
    pullRequests: user.contributionsCollection.totalPullRequestContributions,
    repos: user.contributionsCollection.totalRepositoriesWithContributedCommits,
    repoCount: owned.length,
    weeks,
  };
}

function render(data) {
  const tiles = [
    { value: data.contributions, label: 'CONTRIBUTIONS' },
    { value: data.commits, label: 'COMMITS' },
    { value: data.pullRequests, label: 'PULL REQUESTS' },
    { value: data.repos, label: 'REPOS CONTRIBUTED TO' },
  ]
    .map(
      (s, i) =>
        `<text class="value" x="${40 + i * 215}" y="118">${s.value}</text>\n  ` +
        `<text class="label" x="${40 + i * 215}" y="142">${escape(s.label)}</text>`,
    )
    .join('\n  ');

  const chartX = 40;
  const chartW = 820;
  const baseline = 244;
  const maxBar = 34;
  const peak = Math.max(...data.weeks.map((w) => w.total), 1);
  const step = chartW / data.weeks.length;
  const barW = Math.max(step - 4, 2);

  const bars = data.weeks.map((week, i) => {
    const ratio = week.total / peak;
    const height = week.total === 0 ? 2 : Math.max(Math.round(ratio * maxBar), 3);
    const level =
      week.total === 0 ? 0 : Math.min(Math.floor(ratio * 4) + 1, BAR_LEVELS.length - 1);
    const x = chartX + i * step;
    return `<rect x="${x.toFixed(1)}" y="${(baseline - height).toFixed(1)}" width="${barW.toFixed(1)}" height="${height}" rx="${Math.min(1.5, height / 2).toFixed(1)}" fill="${BAR_LEVELS[level]}"/>`;
  });

  let lastMonth = -1;
  const monthLabels = data.weeks
    .map((week, i) => {
      const month = new Date(`${week.firstDay}T00:00:00Z`).getUTCMonth();
      if (month === lastMonth) return null;
      lastMonth = month;
      return `<text class="axis" x="${(chartX + i * step).toFixed(1)}" y="262">${MONTHS[month]}</text>`;
    })
    .filter(Boolean);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 280" width="900" height="280" role="img" aria-labelledby="statsTitle statsDesc">
  <title id="statsTitle">Prakash Sewani — public activity over the last twelve months</title>
  <desc id="statsDesc">${data.contributions} contributions, ${data.commits} commits and ${data.pullRequests} pull requests across ${data.repos} repositories in the last twelve months, shown as a weekly contribution chart spanning ${data.weeks.length} weeks.</desc>

  <defs>
    <linearGradient id="panelFill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0d1117"/>
      <stop offset="100%" stop-color="#070a0f"/>
    </linearGradient>
    <linearGradient id="panelTop" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.15"/>
      <stop offset="50%" stop-color="#f59e0b" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#22d3ee" stop-opacity="0.25"/>
    </linearGradient>
  </defs>

  <style>
    text {
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
    }
    .value { font-size: 40px; font-weight: 700; fill: #f8fafc; }
    .label { font-size: 12px; letter-spacing: 1.5px; fill: #64748b; }
    .eyebrow { font-size: 11px; letter-spacing: 1.6px; fill: #f59e0b; }
    .axis { font-size: 11px; fill: #475569; }
  </style>

  <rect x="0.5" y="0.5" width="899" height="279" rx="16" fill="url(#panelFill)" stroke="#1e293b"/>
  <rect x="0.5" y="0.5" width="899" height="2" rx="1" fill="url(#panelTop)"/>

  <text class="eyebrow" x="40" y="34">LAST 12 MONTHS</text>
  <text class="label" x="860" y="34" text-anchor="end">PUBLIC ACTIVITY ONLY</text>
  <line x1="40" y1="50" x2="860" y2="50" stroke="#1e293b"/>

  ${tiles}

  <line x1="40" y1="174" x2="860" y2="174" stroke="#1e293b"/>
  <text class="eyebrow" x="40" y="198">WEEKLY CONTRIBUTION SIGNAL</text>
  <text class="label" x="860" y="198" text-anchor="end">${data.weeks.length} WEEKS</text>

  ${bars.join('\n  ')}
  <line x1="${chartX}" y1="${baseline}" x2="${chartX + chartW}" y2="${baseline}" stroke="#1e293b"/>
  ${monthLabels.join('\n  ')}
</svg>
`;
}

const data = await collect();
await writeFile(OUT, render(data), 'utf8');
console.log(
  `Wrote ${OUT}: ${data.contributions} contributions, ${data.commits} commits, ` +
    `${data.pullRequests} PRs, ${data.repos} repos contributed to, ${data.weeks.length} weeks plotted.`,
);
