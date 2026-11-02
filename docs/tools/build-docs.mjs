// Builds docs/index.html (the interactive README), docs/demo.html (the print layout for the PDF) and the feature list inside README.md,
// all from content.mjs and the screenshots in docs/screens.
//   node docs/tools/build-docs.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, features, screens, roadmap, dummy } from './content.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const docs = path.join(here, '..')
const root = path.join(docs, '..')
fs.mkdirSync(path.join(docs, 'assets'), { recursive: true })
fs.copyFileSync(path.join(root, 'public', 'logo.png'), path.join(docs, 'assets', 'logo.png'))
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const byFile = Object.fromEntries(screens.map(s => [s.file, s]))
const total = features.reduce((n, g) => n + g.items.length, 0)

// ── the interactive page ──
const css = `
:root{--bg:#FBF5EC;--card:#fff;--ink:#2A2119;--mute:#7a6a58;--gold:#B8924A;--gold2:#8E6B2A;--line:#eadfce;--green:#2f8f63;--red:#c0392b}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 Inter,system-ui,Segoe UI,Roboto,sans-serif}
a{color:var(--gold2)}header.nav{position:sticky;top:0;z-index:10;background:rgba(251,245,236,.92);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
.nav .in{max-width:1080px;margin:auto;display:flex;align-items:center;gap:18px;padding:10px 20px}.nav img{width:30px;height:30px;border-radius:8px}.nav b{font-size:17px}
.nav a{text-decoration:none;color:var(--mute);font-size:14px;font-weight:600}.nav a:hover{color:var(--ink)}.nav .sp{flex:1}
main{max-width:1080px;margin:auto;padding:0 20px 80px}section{padding-top:56px}h2{font-size:28px;margin:0 0 6px;letter-spacing:-.02em}.lead{color:var(--mute);margin:0 0 20px}
.hero{display:grid;grid-template-columns:1.2fr .8fr;gap:30px;align-items:center;padding-top:48px}.hero h1{font-size:44px;line-height:1.1;margin:0 0 12px;letter-spacing:-.03em}
.badges{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}.badge{border:1px solid var(--line);background:#fff;border-radius:99px;padding:4px 12px;font-size:13px;font-weight:600;color:var(--gold2)}
.stats{display:flex;gap:26px;margin-top:22px}.stats div b{display:block;font-size:26px}.stats div span{font-size:12px;color:var(--mute);text-transform:uppercase;letter-spacing:.06em}
.phone{width:260px;border:9px solid #1d1710;border-radius:38px;background:#1d1710;box-shadow:0 20px 50px rgba(60,40,10,.25);overflow:hidden;margin:auto}.phone img{display:block;width:100%}
.btn{border:1px solid var(--gold);background:linear-gradient(180deg,#EBD6A1,#C9A45C 60%,#B58E45);color:#3a2a0c;border-radius:12px;padding:9px 16px;font-weight:700;cursor:pointer;font-size:14px}
.btn.ghost{background:#fff;color:var(--gold2)}.tools{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:0 0 18px}
.chip{border:1px solid var(--line);background:#fff;border-radius:99px;padding:6px 14px;font-weight:600;font-size:14px;cursor:pointer;color:var(--mute)}.chip.on{background:var(--gold);color:#fff;border-color:var(--gold)}
input.search{flex:1;min-width:200px;border:1px solid var(--line);border-radius:12px;padding:9px 14px;font-size:15px;background:#fff}
.group{margin-bottom:26px}.group h3{margin:0 0 4px;font-size:20px}.group p{margin:0 0 10px;color:var(--mute)}
.item{background:var(--card);border:1px solid var(--line);border-radius:14px;margin-bottom:8px;overflow:hidden}.item summary{cursor:pointer;padding:13px 16px;font-weight:700;list-style:none;display:flex;justify-content:space-between;gap:10px}
.item summary::after{content:'+';color:var(--gold);font-size:20px;line-height:1}.item[open] summary::after{content:'–'}.item .body{padding:0 16px 14px;color:#4a3d30}.item .body .btn{margin-top:8px}
.viewer{display:grid;grid-template-columns:300px 1fr;gap:34px;align-items:start}.thumbs{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.thumb{border:1px solid var(--line);background:#fff;border-radius:10px;padding:8px 10px;font-size:13px;font-weight:600;cursor:pointer;text-align:left}.thumb.on{border-color:var(--gold);background:#fff7e3;color:var(--gold2)}
.cap h3{margin:0 0 4px;font-size:22px}.cap p{margin:0 0 12px;color:var(--mute)}.cap ul{margin:8px 0 0;padding-left:18px}.cap li{margin:3px 0}.ctl{display:flex;gap:8px;margin-top:14px}
.map{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}.map div{background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px}.map h4{margin:0 0 6px;color:var(--gold2)}.map li{margin:2px 0;font-size:14px}.map ul{margin:0;padding-left:16px}
pre{background:#231b12;color:#f3e7d3;border-radius:12px;padding:14px 16px;overflow:auto;font-size:13.5px;position:relative}
.road{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}.road .g{background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px 16px}.road h4{margin:0 0 8px}.road .r{margin:8px 0}.road .r b{display:block}.road .r span{color:var(--mute);font-size:14px}
.tag{display:inline-block;font-size:11px;font-weight:700;border-radius:99px;background:#eef6ff;color:#2760a8;padding:1px 8px;margin-left:6px;text-transform:uppercase}
footer{border-top:1px solid var(--line);padding:24px 20px;text-align:center;color:var(--mute);font-size:14px}
@media(max-width:820px){.hero,.viewer{grid-template-columns:1fr}.hero h1{font-size:34px}.nav .links{display:none}}
`
const data = { features, screens, roadmap }
const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(app.name)} · interactive README</title><link rel="icon" href="assets/logo.png"><style>${css}</style></head><body>
<header class="nav"><div class="in"><img src="assets/logo.png" alt=""><b>${esc(app.name)}</b><span class="sp"></span><span class="links" style="display:flex;gap:18px"><a href="#features">Features</a><a href="#screens">Screens</a><a href="#map">App map</a><a href="#run">Run it</a><a href="#roadmap">Roadmap</a></span></div></header>
<main>
<div class="hero"><div><h1>${esc(app.tagline)}</h1><p class="lead" style="font-size:18px">${esc(app.summary)}</p>
<div class="badges">${app.stack.map(s => `<span class="badge">${esc(s)}</span>`).join('')}</div>
<div class="stats"><div><b>${features.length}</b><span>feature areas</span></div><div><b>${total}</b><span>features</span></div><div><b>${screens.length}</b><span>screens</span></div><div><b>0</b><span>servers</span></div></div>
<div style="margin-top:22px;display:flex;gap:10px;flex-wrap:wrap"><a class="btn" href="#screens" style="text-decoration:none">See the screens</a><a class="btn ghost" href="FinPing-Demo.pdf" style="text-decoration:none">Demo PDF</a></div></div>
<div class="phone"><img id="heroShot" src="screens/${screens[0].file}.png" alt="Home screen"></div></div>

<section id="features"><h2>Features</h2><p class="lead">Everything the app does, by area. Open a feature to read it, and jump to the screen it lives on.</p>
<div class="tools"><input class="search" id="q" placeholder="Search features (try “PPF”, “meter”, “SMS”, “UPI”)"><span id="chips"></span></div><div id="list"></div></section>

<section id="screens"><h2>Screens</h2><p class="lead">Every screen below uses made-up data. Use the arrow keys, the buttons or the list.</p>
<div class="viewer"><div class="phone"><img id="shot" alt=""></div><div><div class="cap" id="cap"></div><div class="ctl"><button class="btn ghost" id="prev">← Previous</button><button class="btn" id="next">Next →</button></div><div class="thumbs" id="thumbs" style="margin-top:18px"></div></div></div></section>

<section id="map"><h2>App map</h2><p class="lead">Five tabs along the bottom, and a Money hub for the rest. Pages opened from the hub have a back arrow to where you came from.</p>
<div class="map">
<div><h4>Bottom bar</h4><ul><li>Home</li><li>History</li><li>Accounts</li><li>Bills</li><li>Wealth</li></ul></div>
<div><h4>Profile (settings)</h4><ul><li>Import and export</li><li>Customise lists and reward rules</li><li>Tidy up transactions</li><li>Money hub</li></ul></div>
<div><h4>Money hub · Earn</h4><ul><li>Salary</li><li>Provident fund</li></ul></div>
<div><h4>Money hub · Pay</h4><ul><li>Bills</li><li>Debt and loans</li><li>Insurance</li><li>Yearly costs</li></ul></div>
<div><h4>Money hub · Grow</h4><ul><li>Wealth: Retirement, Market, Safe</li></ul></div>
<div><h4>Money hub · Insights</h4><ul><li>Card advisor</li><li>Charts</li><li>Advisory</li></ul></div></div></section>

<section id="run"><h2>Run it</h2><p class="lead">Node 18 or newer.</p>
<pre>npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm run preview    # serve the production build</pre>
<p class="lead" style="margin-top:18px">Android app (reads SMS on the phone):</p>
<pre>npm run build
npx cap sync android
npx cap open android</pre>
<p class="lead" style="margin-top:18px">Rebuild these docs and the screenshots (uses made-up data, needs Chrome or Edge):</p>
<pre>npm i --no-save puppeteer-core
npm run dev                                  # in another terminal
node docs/tools/capture.mjs http://localhost:5173
node docs/tools/build-docs.mjs
node docs/tools/make-pdf.mjs                 # writes docs/FinPing-Demo.pdf</pre></section>

<section id="roadmap"><h2>Roadmap</h2><p class="lead">Planned, not built yet.</p><div class="road" id="road"></div></section>
</main><footer>${esc(app.name)} · all data stays on your device · screenshots use made-up data</footer>
<script>
const DATA=${JSON.stringify(data)};
const $=s=>document.querySelector(s);const esc=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
let cur=0,filter='all',query='';
const byFile=Object.fromEntries(DATA.screens.map((s,i)=>[s.file,i]));
function showScreen(i,scroll){cur=(i+DATA.screens.length)%DATA.screens.length;const s=DATA.screens[cur];$('#shot').src='screens/'+s.file+'.png';$('#shot').alt=s.title;
 const feats=DATA.features.flatMap(g=>g.items.filter(it=>it.screen===s.file).map(it=>g.icon+' '+it.title));
 $('#cap').innerHTML='<h3>'+esc(s.title)+'</h3><p>'+esc(s.caption)+'</p>'+(feats.length?'<b>Features on this screen</b><ul>'+feats.map(f=>'<li>'+esc(f)+'</li>').join('')+'</ul>':'');
 document.querySelectorAll('.thumb').forEach((t,k)=>t.classList.toggle('on',k===cur));if(scroll)document.getElementById('screens').scrollIntoView();}
$('#thumbs').innerHTML=DATA.screens.map((s,i)=>'<button class="thumb" data-i="'+i+'">'+(i+1)+'. '+esc(s.title)+'</button>').join('');
$('#thumbs').onclick=e=>{const b=e.target.closest('.thumb');if(b)showScreen(+b.dataset.i)};
$('#prev').onclick=()=>showScreen(cur-1);$('#next').onclick=()=>showScreen(cur+1);
addEventListener('keydown',e=>{if(e.target.tagName==='INPUT')return;if(e.key==='ArrowRight')showScreen(cur+1);if(e.key==='ArrowLeft')showScreen(cur-1)});
function renderFeatures(){const q=query.toLowerCase();let n=0;const html=DATA.features.filter(g=>filter==='all'||g.id===filter).map(g=>{
 const items=g.items.filter(it=>!q||(it.title+' '+it.text+' '+g.title).toLowerCase().includes(q));if(!items.length)return '';n+=items.length;
 return '<div class="group"><h3>'+g.icon+' '+esc(g.title)+'</h3><p>'+esc(g.summary)+'</p>'+items.map(it=>'<details class="item"'+(q?' open':'')+'><summary>'+esc(it.title)+'</summary><div class="body">'+esc(it.text)+(it.screen?'<br><button class="btn ghost" data-s="'+it.screen+'">See the screen →</button>':'')+'</div></details>').join('')+'</div>'}).join('');
 $('#list').innerHTML=html||'<p class="lead">No feature matches that.</p>'}
$('#chips').innerHTML=['<button class="chip on" data-f="all">All</button>'].concat(DATA.features.map(g=>'<button class="chip" data-f="'+g.id+'">'+g.icon+' '+esc(g.title.split(' and ')[0])+'</button>')).join(' ');
$('#chips').onclick=e=>{const b=e.target.closest('.chip');if(!b)return;filter=b.dataset.f;document.querySelectorAll('.chip').forEach(c=>c.classList.toggle('on',c===b));renderFeatures()};
$('#q').oninput=e=>{query=e.target.value;renderFeatures()};
$('#list').onclick=e=>{const b=e.target.closest('[data-s]');if(b)showScreen(byFile[b.dataset.s],true)};
$('#road').innerHTML=DATA.roadmap.map(g=>'<div class="g"><h4>'+esc(g.group)+'<span class="tag">planned</span></h4>'+g.items.map(it=>'<div class="r"><b>'+esc(it.title)+'</b><span>'+esc(it.text)+'</span></div>').join('')+'</div>').join('');
renderFeatures();showScreen(0);
let hi=0;setInterval(()=>{hi=(hi+1)%4;const f=['01-home','04-bills','07-wealth','16-card-advisor'][hi];$('#heroShot').src='screens/'+f+'.png'},3500);
</script></body></html>`
fs.writeFileSync(path.join(docs, 'index.html'), page)

// ── the print layout for the PDF ──
const img = f => `<img src="screens/${f}.png" alt="${esc(byFile[f]?.title || f)}"><div class="cap">${esc(byFile[f]?.title || f)}</div>`
const printCss = `
@page{size:A4;margin:14mm}*{box-sizing:border-box}body{margin:0;font:11pt/1.5 Inter,system-ui,Segoe UI,Arial,sans-serif;color:#2A2119}
.page{page-break-after:always;min-height:262mm}.page:last-child{page-break-after:auto}h1{font-size:30pt;margin:0 0 6mm;letter-spacing:-.02em}h2{font-size:20pt;margin:0 0 3mm;color:#8E6B2A}h3{margin:5mm 0 1mm;font-size:12.5pt}p{margin:0 0 3mm}
.cover{display:flex;flex-direction:column;justify-content:center;align-items:flex-start;min-height:262mm;background:#FBF5EC;margin:-14mm;padding:24mm}.cover img.logo{width:26mm;border-radius:6mm;margin-bottom:10mm}.cover .sub{font-size:14pt;color:#7a6a58;max-width:140mm}
.cover .shots{display:flex;gap:6mm;margin-top:14mm}.cover .shots img{width:42mm;border:2mm solid #1d1710;border-radius:7mm}
.pill{display:inline-block;border:1px solid #d9c9ae;border-radius:99px;padding:.6mm 3mm;margin:0 1.5mm 1.5mm 0;font-size:9pt;color:#8E6B2A;font-weight:600}
.row{display:flex;gap:5mm;margin:4mm 0}.row figure{margin:0;flex:1;text-align:center}.row img{width:100%;max-width:46mm;border:1.6mm solid #1d1710;border-radius:6mm}.row .cap{font-size:8.5pt;color:#7a6a58;margin-top:1.5mm}
ul.f{margin:0;padding-left:5mm}ul.f li{margin:0 0 2.2mm}ul.f b{color:#2A2119}table{width:100%;border-collapse:collapse;margin:2mm 0 5mm;font-size:9.5pt}th,td{border-bottom:1px solid #eadfce;padding:1.6mm 2mm;text-align:left;vertical-align:top}th{background:#f6ecd9;color:#6b5320}
.note{background:#fff7e3;border:1px solid #ecd9a3;border-radius:3mm;padding:3mm 4mm;margin:4mm 0;font-size:10pt}.road{columns:2;column-gap:8mm}.road .g{break-inside:avoid;margin-bottom:4mm}.road b{display:block}.road span{color:#5b4c3b;font-size:10pt}
`
const groupPage = g => {
  const files = [...new Set(g.items.map(i => i.screen).filter(Boolean))].slice(0, 4)
  return `<div class="page"><h2>${g.icon} ${esc(g.title)}</h2><p>${esc(g.summary)}</p>
<div class="row">${files.map(f => `<figure>${img(f)}</figure>`).join('')}</div>
<ul class="f">${g.items.map(i => `<li><b>${esc(i.title)}.</b> ${esc(i.text)}</li>`).join('')}</ul></div>`
}
const printed = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(app.name)} demo</title><style>${printCss}</style></head><body>
<div class="page cover"><img class="logo" src="assets/logo.png" alt=""><h1>${esc(app.name)}</h1><div class="sub">${esc(app.tagline)}</div><p style="margin-top:8mm;max-width:140mm">${esc(app.summary)}</p>
<div>${app.stack.map(s => `<span class="pill">${esc(s)}</span>`).join('')}</div>
<div class="shots">${['01-home', '04-bills', '07-wealth'].map(f => `<img src="screens/${f}.png" alt="">`).join('')}</div>
<p style="margin-top:10mm;font-size:9.5pt;color:#7a6a58">Demo document. ${esc(dummy.note)}</p></div>
<div class="page"><h2>What is in the box</h2><p>${features.length} feature areas, ${total} features and ${screens.length} screens. The next pages show each area with screens from the demo data.</p>
${features.map(g => `<h3>${g.icon} ${esc(g.title)}</h3><p style="margin-bottom:1mm">${esc(g.summary)}</p><div>${g.items.map(i => `<span class="pill">${esc(i.title)}</span>`).join('')}</div>`).join('')}</div>
${features.map(groupPage).join('')}
<div class="page"><h2>The demo data</h2><div class="note">${esc(dummy.note)}</div><p>Persona: <b>${esc(dummy.person)}</b>. This is what the screenshots were taken from.</p>
${dummy.tables.map(t => `<h3>${esc(t.title)}</h3><table><tr>${t.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr>${t.rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`).join('')}</div>
<div class="page"><h2>All screens</h2><div style="display:grid;grid-template-columns:repeat(5,1fr);gap:3mm">${screens.map(s => `<figure style="margin:0;text-align:center"><img src="screens/${s.file}.png" style="width:100%;border:1.2mm solid #1d1710;border-radius:4mm" alt=""><div style="font-size:7.5pt;color:#7a6a58;margin-top:1mm">${esc(s.title)}</div></figure>`).join('')}</div></div>
<div class="page"><h2>Roadmap</h2><p>Planned, not built yet.</p><div class="road">${roadmap.map(g => `<div class="g"><h3>${esc(g.group)}</h3>${g.items.map(i => `<p><b>${esc(i.title)}</b><span>${esc(i.text)}</span></p>`).join('')}</div>`).join('')}</div></div>
</body></html>`
fs.writeFileSync(path.join(docs, 'demo.html'), printed)

// ── README.md: the feature and screen sections between the markers ──
const md = {
  features: features.map(g => `### ${g.icon} ${g.title}\n\n${g.summary}\n\n${g.items.map(i => `- **${i.title}.** ${i.text}`).join('\n')}`).join('\n\n'),
  screens: `| | | |\n|:--:|:--:|:--:|\n${(() => { const rows = []; for (let i = 0; i < screens.length; i += 3) rows.push('| ' + [0, 1, 2].map(k => { const s = screens[i + k]; return s ? `<img src="docs/screens/${s.file}.png" width="200"><br>**${s.title}**<br><sub>${s.caption}</sub>` : '' }).join(' | ') + ' |'); return rows.join('\n') })()}`,
  roadmap: roadmap.map(g => `**${g.group}**\n\n${g.items.map(i => `- ${i.title}: ${i.text}`).join('\n')}`).join('\n\n'),
}
const readmePath = path.join(root, 'README.md')
let readme = fs.readFileSync(readmePath, 'utf8')
for (const k of ['features', 'screens', 'roadmap']) {
  const re = new RegExp(`<!-- ${k.toUpperCase()}:START -->[\\s\\S]*?<!-- ${k.toUpperCase()}:END -->`)
  if (re.test(readme)) readme = readme.replace(re, `<!-- ${k.toUpperCase()}:START -->\n${md[k]}\n<!-- ${k.toUpperCase()}:END -->`)
}
fs.writeFileSync(readmePath, readme)
console.log(`built index.html, demo.html and README sections (${features.length} areas, ${total} features, ${screens.length} screens)`)
