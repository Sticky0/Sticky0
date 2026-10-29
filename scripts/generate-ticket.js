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
.t{position:relative;overflow:hidden;width:420px;background:#fffef9;padding:64px 26px 36px;font-family:"Courier New",Courier,monospace;font-size:15px;color:#222;
 -webkit-mask:conic-gradient(from -45deg at bottom,#0000,#000 1deg 89deg,#0000 90deg) bottom/18px 100% repeat-x}
.c{text-align:center}.big{font-size:24px;font-weight:bold;letter-spacing:2px;color:#6a1b9a}
.slime{position:absolute;top:0;left:0}
hr{border:0;border-top:2px dashed #555;margin:12px 0}
.r{display:flex;justify-content:space-between;margin:3px 0}
.h{font-weight:bold}.tot{font-size:20px;font-weight:bold}.s{font-size:12px;color:#444}
.bar{height:56px;margin:14px auto 4px;width:300px;background:repeating-linear-gradient(90deg,#000 0 2px,#fffef9 2px 4px,#000 4px 5px,#fffef9 5px 8px,#000 8px 11px,#fffef9 11px 12px,#000 12px 13px,#fffef9 13px 16px)}
</style></head><body><div class="t">
${slime(472, 5, { band: 6, min: 8, max: 34, gap: 38 })}
<div class="c big">🛒 StickyTM</div>
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

// Mejunje morado que gotea: una franja con gotas que cuelgan, fundidas con un filtro "goo".
function slime(width, seed, { band = 16, min = 18, max = 70, gap = 46, rounded = false } = {}) {
  let r = seed;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  const count = Math.max(1, Math.round(width / gap));
  const pad = rounded ? 16 : 0;
  const height = band + max + 40;
  const id = `goo${seed}`;
  // Sin bordes redondeados la franja se sale por los lados para cubrir todo el ancho.
  let blobs = rounded
    ? `<rect x="10" y="0" width="${width - 20}" height="${band}" rx="${band / 2}"/>`
    : `<rect x="-20" y="-20" width="${width + 40}" height="${band + 20}"/>`;
  let shine = '';
  for (let i = 0; i < count; i++) {
    const x = pad + ((i + 0.2 + rnd() * 0.6) * (width - 2 * pad)) / count;
    const w = 9 + rnd() * 14;
    const len = band + min + rnd() * (max - min);
    blobs += `<rect x="${x - w / 2}" y="0" width="${w}" height="${len}" rx="${w / 2}"/>`;
    blobs += `<circle cx="${x}" cy="${len - w * 0.3}" r="${w * 0.68}"/>`;
    shine += `<ellipse cx="${x - w * 0.22}" cy="${len - w * 0.55}" rx="${w * 0.16}" ry="${w * 0.26}" fill="#fff" opacity=".55"/>`;
    if (rnd() < 0.3) blobs += `<circle cx="${x}" cy="${len + 14 + rnd() * 10}" r="${w * 0.36}"/>`;
  }
  return `<svg class="slime" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
<defs><filter id="${id}" x="-10%" y="-10%" width="120%" height="130%"><feGaussianBlur stdDeviation="5"/><feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 22 -9"/></filter>
<linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6a1b9a"/><stop offset="1" stop-color="#ab47bc"/></linearGradient></defs>
<g filter="url(#${id})" fill="url(#${id}g)">${blobs}</g>
${rounded ? '' : `<rect x="0" y="3" width="${width}" height="3" fill="#fff" opacity=".25"/>`}${shine}</svg>`;
}

// Fachada del supermercado para la cabecera del README.
function renderBanner() {
  const shelf = ['☕', '🍎', '🥖', '🧀', '🥫', '🍪', '🥛', '🍌', '🧃', '🍫', '🥚', '🍕']
    .map((p) => `<span>${p}</span>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Rubik:wght@500;800;900&display=swap" rel="stylesheet">
<style>
body{margin:0;background:transparent;font-family:Rubik,Arial,sans-serif}
.b{position:relative;width:820px;margin:10px;border-radius:18px;overflow:hidden;border:6px solid #7b1fa2;background:#fff8e1;box-sizing:border-box}
.slime{position:absolute;left:0;pointer-events:none}
.b>.slime{top:78px;z-index:2}
.awning{height:64px;background:repeating-linear-gradient(90deg,#e30613 0 46px,#fff 46px 92px);position:relative}
.awning:after{content:"";position:absolute;left:0;right:0;bottom:-22px;height:23px;
 background:radial-gradient(circle at 23px 0,#e30613 22px,transparent 23px) 0 0/92px 23px repeat-x,
 radial-gradient(circle at 23px 0,#fff 22px,transparent 23px) 46px 0/92px 23px repeat-x}
.sign{position:relative;margin:52px 34px 0;background:#ffd400;border-radius:14px;padding:22px 26px;display:flex;align-items:center;gap:22px;
 box-shadow:0 8px 0 #c9a800}
.cart{font-size:78px;line-height:1}
.name{position:relative;isolation:isolate;white-space:nowrap;font-weight:900;font-size:58px;line-height:.95;letter-spacing:1px;
 color:#8e24aa;text-shadow:0 2px 0 #4a148c,3px 4px 0 #fff}
.tag{font-weight:800;font-size:22px;color:#1a1a1a;margin-top:8px}
.open{margin-left:auto;text-align:center;border:4px solid #00e676;border-radius:12px;padding:8px 12px;color:#00e676;
 background:#102a1b;font-weight:900;font-size:22px;line-height:1.05;text-shadow:0 0 8px #00e676;box-shadow:0 0 14px #00e676;transform:rotate(4deg)}
.open small{display:block;font-size:15px;color:#b9f6ca}
.shelf{display:flex;justify-content:space-around;margin:26px 34px 0;padding:0 0 6px;border-bottom:10px solid #8d5a2b;font-size:38px}
.strip{margin-top:22px;background:#4a148c;color:#ffd400;font-weight:800;font-size:20px;letter-spacing:3px;padding:12px 0;text-align:center;white-space:nowrap}
.strip b{color:#fff}
</style></head><body><div class="b">
<div class="awning"></div>
${slime(808, 7, { band: 6, min: 10, max: 56, gap: 40 })}
<div class="sign"><div class="cart">🛒</div>
<div><div class="name">StickyTM</div><div class="tag">Fullstack Developer · España 🇪🇸</div></div>
<div class="open">ABIERTO<br>24H<small>siempre</small></div></div>
<div class="shelf">${shelf}</div>
<div class="strip">CÓDIGO FRESCO Y PEGAJOSO <b>·</b> SIEMPRE APRENDIENDO</div>
</div></body></html>`;
}

// Lista de la compra (tech stack) escrita a mano en un pósit.
const SHOPPING_LIST = [
  ['🥩 Carnicería', ['Java ★', 'JavaScript', 'Kotlin', 'Python', 'PHP', 'C / C++', 'HTML5', 'Shell y PowerShell']],
  ['🥦 Frutería', ['Spring', 'Hibernate', 'JavaFX', 'Symfony', 'AngularJS', 'Bootstrap', 'WordPress']],
  ['🧀 Lácteos', ['MySQL', 'MongoDB', 'SQLite', 'Firebase', 'AWS']],
  ['🧰 Droguería', ['Git y GitHub', 'Bitbucket', 'Jira', 'Docker', 'Apache']],
];

function renderList() {
  const sections = SHOPPING_LIST.map(
    ([title, items]) => `<div class="sec"><h2>${title}</h2>${items.map((i) => `<div class="it"><span class="box">✓</span>${esc(i)}</div>`).join('')}</div>`
  ).join('\n');
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&display=swap" rel="stylesheet">
<style>
body{margin:0;background:transparent}
.wrap{padding:40px 30px 30px;width:760px}
.note{position:relative;transform:rotate(-1.5deg);padding:92px 40px 36px;color:#2b2b6e;
 font-family:Caveat,"Comic Sans MS",cursive;font-size:27px;
 background:linear-gradient(180deg,#fff27a 0%,#ffe94d 100%);
 box-shadow:0 18px 20px -12px rgba(0,0,0,.45),0 2px 4px rgba(0,0,0,.15)}
.note:after{content:"";position:absolute;right:0;bottom:0;width:48px;height:48px;
 background:linear-gradient(135deg,#e6cf2f 0 50%,transparent 50%);box-shadow:-3px -3px 6px rgba(0,0,0,.12)}
.note>.slime{position:absolute;top:2px;left:50%;margin-left:-90px}
.tape{z-index:1;position:absolute;top:-16px;left:50%;width:150px;height:36px;margin-left:-75px;transform:rotate(2deg);
 background:rgba(255,255,255,.55);box-shadow:0 1px 3px rgba(0,0,0,.15)}
h1{margin:0 0 14px;font-size:50px;text-align:center;color:#c0262d}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:6px 40px}
h2{margin:10px 0 2px;font-size:33px;text-decoration:underline;text-decoration-thickness:2px}
.it{display:flex;align-items:center;gap:10px;line-height:1.25}
.box{display:inline-flex;width:20px;height:20px;border:2px solid #2b2b6e;border-radius:4px;align-items:center;justify-content:center;font-size:22px;color:#c0262d}
.foot{margin-top:18px;text-align:center;font-size:28px;color:#c0262d}
</style></head><body><div class="wrap"><div class="note">${slime(180, 9, { band: 14, min: 12, max: 52, gap: 34, rounded: true })}<div class="tape"></div>
<h1>Lista de la compra 🛒</h1>
<div class="cols">${sections}</div>
<div class="foot">☐ y mañana… ¡algo nuevo que aprender!</div>
</div></div></body></html>`;
}

// Cartel de ofertas: cada estadística es una etiqueta de precio.
function renderOffers(stats) {
  const fmt = (n) => (n == null ? '—' : new Intl.NumberFormat('es-ES').format(n));
  const tags = [
    ['CONTRIBUCIONES', 'último año', stats.contributions, 'uds'],
    ['COMMITS', 'último año', stats.commits, 'uds'],
    ['RACHA ACTUAL', 'sin parar', stats.currentStreak, stats.currentStreak === 1 ? 'día' : 'días'],
    ['RACHA MÁXIMA', 'último año', stats.longestStreak, stats.longestStreak === 1 ? 'día' : 'días'],
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

  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Rubik:wght@500;800;900&display=swap" rel="stylesheet">
<style>
body{margin:0;background:transparent;font-family:Rubik,Arial,sans-serif;font-weight:800}
.f{position:relative;overflow:hidden;width:820px;margin:10px;background:#ffd400;border:6px solid #7b1fa2;border-radius:18px;padding:62px 24px 26px;box-sizing:border-box;color:#1a1a1a}
.slime{position:absolute;top:0;left:0;pointer-events:none}
.top{display:flex;justify-content:space-between;align-items:center}
h1{margin:0;font-size:40px;color:#e30613;letter-spacing:1px;text-transform:uppercase}
.badge{background:#e30613;color:#fff;font-size:18px;padding:10px 16px;border-radius:50%;transform:rotate(8deg);text-align:center;line-height:1.1}
.lead{font-weight:500;margin:2px 0 18px}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.tag{background:#fff;border-radius:10px;padding:10px 12px;border:2px dashed #e30613}
.n{font-size:13px;color:#e30613}.sub{font-weight:500;font-size:12px;color:#555}
.v{font-size:36px;line-height:1.15}.v small{font-size:14px;margin-left:4px}
h2{font-size:20px;margin:20px 0 8px;color:#e30613}
.langs{background:#fff;border-radius:10px;padding:12px 16px}
.lang{display:flex;align-items:center;gap:12px;margin:5px 0;font-weight:500}
.ln{width:110px}.pct{width:70px;text-align:right}
.bar{flex:1;height:14px;background:#f1f1f1;border-radius:7px;overflow:hidden}.bar i{display:block;height:100%;background:#e30613}
</style></head><body><div class="f">
${slime(808, 11, { band: 8, min: 8, max: 40, gap: 50 })}
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
  await offers.setContent(renderOffers(stats), { waitUntil: 'networkidle' });
  await offers.evaluate(() => document.fonts.ready);
  await offers.locator('.f').screenshot({ path: path.join(OUT, 'ofertas.png'), omitBackground: true });

  const banner = await browser.newPage({ viewport: { width: 840, height: 100 }, deviceScaleFactor: 2 });
  await banner.setContent(renderBanner(), { waitUntil: 'networkidle' });
  await banner.evaluate(() => document.fonts.ready);
  await banner.locator('.b').screenshot({ path: path.join(OUT, 'cabecera.png'), omitBackground: true });

  const list = await browser.newPage({ viewport: { width: 820, height: 100 }, deviceScaleFactor: 2 });
  await list.setContent(renderList(), { waitUntil: 'networkidle' });
  await list.evaluate(() => document.fonts.ready);
  await list.locator('.wrap').screenshot({ path: path.join(OUT, 'lista.png'), omitBackground: true });
  await browser.close();
  console.log('Imágenes generadas en assets/');
})();
