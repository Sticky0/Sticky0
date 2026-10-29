// Genera el ticket de compra del README (assets/ticket.png y assets/ticket.pdf)
// a partir de los lenguajes de los repositorios públicos de GitHub.
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

// Reparte 100,00 € entre los lenguajes según su peso, agrupando el resto en "OTROS".
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

(async () => {
  let stats;
  try {
    stats = await fetchStats();
  } catch (e) {
    console.warn(`No se pudo leer la API de GitHub (${e.message}); usando datos por defecto.`);
    stats = { languages: FALLBACK };
  }
  const html = render({ ...stats, items: toItems(stats.languages) }, new Date());

  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 520, height: 100 }, deviceScaleFactor: 2 });
  await page.setContent(html);
  await page.screenshot({ path: path.join(OUT, 'ticket.png'), fullPage: true });
  const height = await page.evaluate(() => document.body.scrollHeight);
  await page.pdf({ path: path.join(OUT, 'ticket.pdf'), width: '520px', height: `${height}px`, printBackground: true, pageRanges: '1' });
  await browser.close();
  console.log('Ticket generado en assets/');
})();
