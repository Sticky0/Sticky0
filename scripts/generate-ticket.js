// Genera las imágenes del README a partir de los datos públicos de GitHub:
// el ticket de compra (assets/ticket.png y assets/ticket.pdf) y el cartel
// de ofertas con las estadísticas (assets/ofertas.png).
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const USER = process.env.GITHUB_USER || 'Sticky0';
const TOKEN = process.env.GITHUB_TOKEN;
const OUT = path.join(__dirname, '..', 'assets');
const MAX_ITEMS = 10;

// Si la API de GitHub no responde, se usa esta lista.
const FALLBACK = { Java: 55, JavaScript: 18, Kotlin: 9, HTML: 7, PHP: 5, Python: 3, CSS: 3 };

async function gh(url) {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': USER };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  const res = await fetch(`https://api.github.com${url}`, { headers });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

async function fetchStats() {
  const [user, repos] = await Promise.all([
    gh(`/users/${USER}`),
    gh(`/users/${USER}/repos?per_page=100&type=owner`),
  ]);
  const own = repos.filter((r) => !r.fork);
  const bytes = {};
  for (const r of own) {
    const langs = await gh(`/repos/${USER}/${r.name}/languages`);
    for (const [lang, n] of Object.entries(langs)) bytes[lang] = (bytes[lang] || 0) + n;
  }
  return {
    languages: bytes,
    repos: own.length,
    stars: own.reduce((s, r) => s + r.stargazers_count, 0),
    followers: user.followers,
  };
}

// Contribuciones del último año (la API GraphQL necesita token).
async function fetchContributions() {
  if (!TOKEN) throw new Error('sin GITHUB_TOKEN');
  const query = `query($login:String!){user(login:$login){
    pullRequests{totalCount} issues{totalCount}
    contributionsCollection{totalCommitContributions contributionCalendar{totalContributions
      weeks{contributionDays{date contributionCount}}}}}}`;
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'User-Agent': USER },
    body: JSON.stringify({ query, variables: { login: USER } }),
  });
  const { data, errors } = await res.json();
  if (!res.ok || errors) throw new Error(`graphql: ${res.status}`);
  const c = data.user.contributionsCollection;
  const days = c.contributionCalendar.weeks.flatMap((w) => w.contributionDays);
  return {
    contributions: c.contributionCalendar.totalContributions,
    commits: c.totalCommitContributions,
    prs: data.user.pullRequests.totalCount,
    issues: data.user.issues.totalCount,
    ...streaks(days),
  };
}

function streaks(days) {
  let longest = 0;
  let run = 0;
  for (const d of days) {
    run = d.contributionCount > 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  // La racha actual no se rompe si hoy todavía no hay contribuciones.
  let i = days.length - 1;
  if (i >= 0 && days[i].contributionCount === 0) i--;
  let current = 0;
  while (i >= 0 && days[i].contributionCount > 0) { current++; i--; }
  return { currentStreak: current, longestStreak: longest };
}

// Reparte 100,00 €entre los lenguajes según su peso, agrupando el resto en "OTROS".
function toItems(languages) {
  const sorted = Object.entries(languages).sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((s, [, n]) => s + n, 0) || 1;
  let items = sorted.slice(0, MAX_ITEMS).map(([name, n]) => ({ name, cents: Math.round((n / total) * 10000) }));
  const rest = sorted.slice(MAX_ITEMS).reduce((s, [, n]) => s + n, 0);
  if (rest) items.push({ name: 'Otros', cents: Math.round((rest / total) * 10000) });
  items = items.filter((i) => i.cents > 0);
  // Ajuste de redondeo para que el total sea exactamente 100,00
  const diff = 10000 - items.reduce((s, i) => s + i.cents, 0);
  if (items.length) items[0].cents += diff;
  return items;
}

const euros = (cents) => (cents / 100).toFixed(2).replace('.', ',');
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

function render({ items, repos, stars, followers }, now) {
  const fmt = (o) => new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', ...o }).format(now);
  const date = fmt({ day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = fmt({ hour: '2-digit', minute: '2-digit' });
  const code = date.replace(/\D/g, '') + time.replace(/\D/g, '');
  const rows = items
    .map((i, n) => `<div class="r"><span>1 ${esc(i.name.toUpperCase())}${n === 0 ? ' ★' : ''}</span><span>${euros(i.cents)}</span></div>`)
    .join('\n');
  const extra = [
    repos != null && `<div class="r s"><span>REPOSITORIOS EN STOCK</span><span>${repos}</span></div>`,
    stars != null && `<div class="r s"><span>ESTRELLAS ACUMULADAS</span><span>${stars} ★</span></div>`,
    followers != null && `<div class="r s"><span>CLIENTES FIELES</span><span>${followers}</span></div>`,
  ].filter(Boolean).join('\n');

  return `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#e9e4da;display:flex;justify-content:center;padding:40px 0}
.t{width:420px;background:#fffef9;padding:28px 26px 36px;font-family:"Courier New",Courier,monospace;font-size:15px;color:#222;
 -webkit-mask:conic-gradient(from -45deg at bottom,#0000,#000 1deg 89deg,#0000 90deg) bottom/18px 100% repeat-x}
.c{text-align:center}.big{font-size:24px;font-weight:bold;letter-spacing:2px}
hr{border:0;border-top:2px dashed #555;margin:12px 0}
.r{display:flex;justify-content:space-between;margin:3px 0}
.h{font-weight:bold}.tot{font-size:20px;font-weight:bold}.s{font-size:12px;color:#444}
.bar{height:56px;margin:14px auto 4px;width:300px;background:repeating-linear-gradient(90deg,#000 0 2px,#fffef9 2px 4px,#000 4px 5px,#fffef9 5px 8px,#000 8px 11px,#fffef9 11px 12px,#000 12px 13px,#fffef9 13px 16px)}
</style></head><body><div class="t">
<div class="c big">🛒 SUPER ISAAC</div>
<div class="c">Productos frescos de código</div>
<div class="c s">C/ Fullstack, 1 · España<br>Contacto: isaacsanz@proton.me</div>
<hr>
<div class="r s"><span>FECHA: ${date}</span><span>HORA: ${time}</span></div>
<div class="r s"><span>CAJA: 01</span><span>CAJERO: GITHUB ACTIONS</span></div>
<hr>
<div class="r h"><span>CANT DESCRIPCIÓN</span><span>IMPORTE</span></div>
${rows}
<div class="r"><span>1 GANAS DE APRENDER</span><span>GRATIS</span></div>
<hr>
<div class="r tot"><span>TOTAL</span><span>100,00 €</span></div>
<div class="r"><span>PAGADO CON</span><span>CAFÉ ☕</span></div>
<hr>
<div class="r s"><span>ARTÍCULOS: ${items.length + 1}</span><span>IVA INCLUIDO</span></div>
${extra}
<hr>
<div class="c">★ ¡GRACIAS POR SU VISITA! ★<br>Vuelva pronto</div>
<div class="bar"></div>
<div class="c s">${code.split('').join(' ')}</div>
<div class="c s" style="margin-top:8px">github.com/${esc(USER)}</div>
</div></body></html>`;
}

// Cartel de ofertas: cada estadística es una etiqueta de precio.
function renderOffers(stats) {
  const fmt = (n) => (n == null ? '—' : new Intl.NumberFormat('es-ES').format(n));
  const tags = [
    ['CONTRIBUCIONES', 'último año', stats.contributions, 'uds'],
    ['COMMITS', 'último año', stats.commits, 'uds'],
    ['RACHA ACTUAL', 'sin parar', stats.currentStreak, 'días'],
    ['RACHA MÁXIMA', 'último año', stats.longestStreak, 'días'],
    ['PULL REQUESTS', 'total', stats.prs, 'uds'],
    ['ISSUES', 'total', stats.issues, 'uds'],
    ['ESTRELLAS', 'en mis repos', stats.stars, '★'],
    ['REPOSITORIOS', 'en stock', stats.repos, 'uds'],
  ]
    .map(([name, sub, value, unit]) => `<div class="tag"><div class="n">${name}</div><div class="v">${fmt(value)}<small>${unit}</small></div><div class="sub">${sub}</div></div>`)
    .join('\n');
  const bars = toItems(stats.languages)
    .slice(0, 5)
    .map((i) => `<div class="lang"><span class="ln">${esc(i.name)}</span><span class="bar"><i style="width:${i.cents / 100}%"></i></span><span class="pct">${euros(i.cents)}%</span></div>`)
    .join('\n');

  return `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;background:transparent;font-family:"Arial Black","Helvetica Neue",Arial,sans-serif}
.f{width:820px;margin:10px;background:#ffd400;border:6px solid #e30613;border-radius:18px;padding:22px 24px 26px;box-sizing:border-box;color:#1a1a1a}
.top{display:flex;justify-content:space-between;align-items:center}
h1{margin:0;font-size:40px;color:#e30613;letter-spacing:1px;text-transform:uppercase}
.badge{background:#e30613;color:#fff;font-size:18px;padding:10px 16px;border-radius:50%;transform:rotate(8deg);text-align:center;line-height:1.1}
.lead{font-family:Arial,sans-serif;font-weight:bold;margin:2px 0 18px}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.tag{background:#fff;border-radius:10px;padding:10px 12px;border:2px dashed #e30613}
.n{font-size:13px;color:#e30613}.sub{font-family:Arial,sans-serif;font-size:12px;color:#555}
.v{font-size:36px;line-height:1.15}.v small{font-size:14px;margin-left:4px}
h2{font-size:20px;margin:20px 0 8px;color:#e30613}
.langs{background:#fff;border-radius:10px;padding:12px 16px}
.lang{display:flex;align-items:center;gap:12px;margin:5px 0;font-family:Arial,sans-serif;font-weight:bold}
.ln{width:110px}.pct{width:70px;text-align:right}
.bar{flex:1;height:14px;background:#f1f1f1;border-radius:7px;overflow:hidden}.bar i{display:block;height:100%;background:#e30613}
</style></head><body><div class="f">
<div class="top"><h1>🏷️ Ofertas de la semana</h1><div class="badge">¡SOLO<br>HOY!</div></div>
<div class="lead">Estadísticas frescas de github.com/${esc(USER)}</div>
<div class="grid">${tags}</div>
<h2>🥇 LOS MÁS VENDIDOS (lenguajes)</h2>
<div class="langs">${bars}</div>
</div></body></html>`;
}

(async () => {
  let stats;
  try {
    stats = await fetchStats();
  } catch (e) {
    console.warn(`No se pudo leer la API de GitHub (${e.message}); usando datos por defecto.`);
    stats = { languages: FALLBACK };
  }
  try {
    Object.assign(stats, await fetchContributions());
  } catch (e) {
    console.warn(`No se pudieron leer las contribuciones (${e.message}).`);
  }
  const html = render({ ...stats, items: toItems(stats.languages) }, new Date());

  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 520, height: 100 }, deviceScaleFactor: 2 });
  await page.setContent(html);
  await page.screenshot({ path: path.join(OUT, 'ticket.png'), fullPage: true });
  const height = await page.evaluate(() => document.body.scrollHeight);
  await page.pdf({ path: path.join(OUT, 'ticket.pdf'), width: '520px', height: `${height}px`, printBackground: true, pageRanges: '1' });

  const offers = await browser.newPage({ viewport: { width: 840, height: 100 }, deviceScaleFactor: 2 });
  await offers.setContent(renderOffers(stats));
  await offers.locator('.f').screenshot({ path: path.join(OUT, 'ofertas.png'), omitBackground: true });
  await browser.close();
  console.log('Imágenes generadas en assets/');
})();
