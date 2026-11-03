const vm = require('vm'), fs = require('fs');
const src = fs.readFileSync('platform-host.js','utf8');
function run(host, pathname, search, opts = {}) {
  const loc = { hostname: host, pathname, search: search || '', hash: opts.hash || '', replaced: null, replace(u) { this.replaced = u; } };
  const win = {}; win.self = opts.framed ? {} : win; win.top = opts.framed ? {x:1} : win;
  const ctx = { location: loc, window: win, document: {}, URLSearchParams, console,
    __PLATFORM_ROOT_DOMAIN__: opts.root || '', __LEGACY_REDIRECT_HOST__: opts.legacy || '' };
  vm.createContext(ctx); vm.runInContext(src, ctx);
  const P = win.__PLATFORM__;
  return { to: loc.replaced, param: P.allowsPharmacyParam(), fallback: P.allowsDefaultFallback(), strict: P.strict };
}
const R = 'example.com';
const cases = [
  ['غير صارم: أي شيء يعمل كالقديم', run('shop.pages.dev','/','?p=rose'), { to:null, param:true, fallback:true, strict:false }],
  ['صارم: pages.dev القديم بلا معامل → القطن', run('shop.pages.dev','/','',{root:R}), { to:'https://cottanpharmacy.example.com/' }],
  ['صارم: pages.dev مع ?p=rose#product=5', run('shop.pages.dev','/index.html','?p=rose&x=1',{root:R,hash:'#product=5'}), { to:'https://rose.example.com/index.html?x=1#product=5' }],
  ['صارم: LEGACY_HOST للقطن', run('shop.pages.dev','/admin.html','',{root:R,legacy:'cottan.example.com'}), { to:'https://cottan.example.com/admin.html' }],
  ['صارم: معاينة pages.dev لا تُحوَّل وتسمح بالمعامل', run('abc123.shop.pages.dev','/','?pharmacy=rose',{root:R}), { to:null, param:true, fallback:true }],
  ['صارم: localhost يسمح', run('localhost','/','?pharmacy=rose',{root:R}), { to:null, param:true, fallback:true }],
  ['صارم: دومين حقيقي يهمل المعامل ولا يرجع للقطن', run('rose.example.com','/','?pharmacy=x',{root:R}), { to:null, param:false, fallback:false }],
  ['صارم: admin.<root> الجذر → super-admin', run('admin.example.com','/','',{root:R}), { to:'/super-admin.html' }],
  ['صارم: إطار المعاينة على admin.<root> لا يُحوَّل ويسمح بالمعامل', run('admin.example.com','/index.html','?pharmacy=rose&__tplpreview=1',{root:R,framed:true}), { to:null, param:true }],
  ['صارم: إطار المعاينة على دومين متجر لا يسمح', run('rose.example.com','/index.html','?pharmacy=x&__tplpreview=1',{root:R,framed:true}), { param:false }],
  ['صارم: super-admin على دومين متجر → admin.<root>', run('rose.example.com','/super-admin.html','',{root:R}), { to:'https://admin.example.com/super-admin.html' }],
  ['صارم: super-admin على admin.<root> يبقى', run('admin.example.com','/super-admin.html','',{root:R}), { to:null }],
  ['صارم: super-admin على pages.dev القديم → admin.<root>', run('shop.pages.dev','/super-admin.html','',{root:R}), { to:'https://admin.example.com/super-admin.html' }],
];
let bad = 0;
for (const [name, got, want] of cases) {
  const ok = Object.keys(want).every(k => got[k] === want[k]);
  if (!ok) bad++;
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  got=' + JSON.stringify(got)));
}
// engine cleanDesign
const win = { self: null, top: null }; win.self = win; win.top = win;
const ctx2 = { window: win, document: { getElementById(){return null}, createElement(){return {}}, head:{appendChild(){}} }, location: { search: '' }, fetch(){}, localStorage:{setItem(){}}, console };
vm.createContext(ctx2);
vm.runInContext(fs.readFileSync('template-contract.js','utf8'), ctx2);
vm.runInContext(fs.readFileSync('template-engine.js','utf8'), ctx2);
const E = win.TemplateEngine;
const clean = E.cleanDesign({ primaryColor:'#112233', design:{ template:'x', colors:{primary:'red;}</style>'}, fonts:{body:'comic', heading:'tajawal'}, shapes:{radius:'huge'}, home:{order:['brands','hero','evil'], hidden:['hero','nope']}, features:{bundles:false} }}, {id:'classic'}, win.PharmacyTemplates && null);
const colorNormal = E.cleanDesign({ primaryColor: '#111111', design: { colors: { primary: '#222222' } } }, { id: 'classic' }, null, false).colors.primary;
const colorPreview = E.cleanDesign({ primaryColor: '#111111', design: { colors: { primary: '#222222' } } }, { id: 'classic' }, null, true).colors.primary;
const checks = [
  ['عادي: لون الصيدلية يتفوق على لون قديم داخل design', colorNormal === '#111111'],
  ['معاينة: لون design يتفوق', colorPreview === '#222222'],
  ['لون غير صالح يُهمَل ويرجع primaryColor', clean.colors.primary === '#112233'],
  ['خط غير مسموح يُهمَل، المسموح يبقى', !clean.fonts.body && clean.fonts.heading === 'tajawal'],
  ['زوايا غير مسموحة تُهمَل', !clean.shapes.radius],
  ['ترتيب الرئيسية: معرّفات صالحة فقط + الناقص يُكمَّل', clean.home.order.join() === 'brands,hero,promo-cards,best-sellers'],
  ['إخفاء: معرّفات صالحة فقط', clean.home.hidden.join() === 'hero'],
  ['ميزة مغلقة تُحترم والبقية تعمل', clean.features.bundles === false && clean.features.offers === true],
];
checks.forEach(([n, ok]) => { if (!ok) bad++; console.log((ok ? 'PASS ' : 'FAIL ') + n); });
process.exit(bad ? 1 : 0);
