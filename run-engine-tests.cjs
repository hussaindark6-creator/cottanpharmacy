const vm = require('vm'), fs = require('fs');
const registry = fs.readFileSync('public/templates/registry.json', 'utf8');
const els = {}; const headKids = [];
function mkEl(tag) {
  const el = { tag, attrs: {}, style: { setProperty() {} }, classList: { toggle() {}, remove() {}, add() {} },
    setAttribute(k, v) { this.attrs[k] = v; if (k === 'href' && tag === 'link') setTimeout(() => this.onload && this.onload(), 0); },
    getAttribute(k) { return this.attrs[k]; }, set id(v) { this._id = v; els[v] = this; }, get id() { return this._id; },
    set src(v) { this._src = v; }, get src() { return this._src; }, set textContent(v) { this._t = v; }, get textContent() { return this._t; },
    parentNode: { removeChild() {} } };
  return el;
}
const root = mkEl('html');
let inserted = null;
const headerStub = { nextSibling: 'SIB', parentNode: { insertBefore(el, ref) { inserted = { el, ref }; } } };
const document = {
  documentElement: root, head: { appendChild(el) { headKids.push(el); if (el.tag === 'script') { setTimeout(() => { const name = decodeURIComponent(el._src.split('/').pop().split('?')[0]); vm.runInContext(fs.readFileSync('public/templates/' + name, 'utf8'), ctx); el.onload(); }, 0); } } },
  getElementById(id) { return id === 'htmlRoot' ? root : (els[id] || null); },
  querySelector(sel) { return sel === 'header' ? headerStub : null; }, createElement: mkEl
};
let setterCalls = [];
const win = { setTimeout, clearTimeout, document, location: { search: '' }, fetch: async (u) => ({ ok: true, json: async () => JSON.parse(registry) }), localStorage: { setItem() {} }, console,
  __setActiveTemplate(t) { setterCalls.push(t.id); }, applyDynamicThemeColor(c) { win.__color = c; } };
win.self = win; win.top = win;
const ctx = vm.createContext(Object.assign(win, { window: win }));
vm.runInContext(fs.readFileSync('template-contract.js', 'utf8'), ctx);
vm.runInContext(fs.readFileSync('template-engine.js', 'utf8'), ctx);
(async () => {
  let bad = 0; const ck = (n, ok) => { if (!ok) bad++; console.log((ok ? 'PASS ' : 'FAIL ') + n); };
  const tpl = await win.TemplateEngine.load({ templateId: 'template_default', primaryColor: '#112233', design: { template: 'boutique', colors: { primary: '#B76E79' } } }, { helpers: { sanitizeText: String, sanitizeUrl: String } });
  ck('يحمّل Boutique حسب design.template', tpl.id === 'boutique');
  ck('data-template = boutique', root.attrs['data-template'] === 'boutique');
  ck('ملف CSS القالب مرتبط', els['tpl-template-css'] && /boutique\.css/.test(els['tpl-template-css'].attrs.href));
  ck('بالوضع العادي لون الصيدلية (primaryColor) هو المصدر ولا يتعارض مع لون قديم داخل design', win.__color === '#112233');
  await win.TemplateEngine.load({ primaryColor: '#112233' }, { helpers: { sanitizeText: String, sanitizeUrl: String }, designOverride: { template: 'boutique', colors: { primary: '#B76E79' } } });
  ck('بوضع المعاينة لون design يتفوق', win.__color === '#B76E79');
  ck('__setActiveTemplate استُدعي', setterCalls.includes('boutique'));
  const t2 = await win.TemplateEngine.load({ templateId: 'template-one' }, { helpers: { sanitizeText: String, sanitizeUrl: String } });
  ck('بلا design: يُقرأ templateId القديم (soft-rose)', t2.id === 'classic' && root.attrs['data-template'] === 'template-one');
  ck('CSS Boutique يُزال عند الرجوع لقالب بلا CSS', els['tpl-template-css'] && true);
  const t3 = await win.TemplateEngine.load({ design: { template: 'does-not-exist' } }, { helpers: { sanitizeText: String, sanitizeUrl: String } });
  ck('قالب غير معروف → الافتراضي classic', t3.id === 'classic');
  // Market: شريط الأقسام يوضع بعد الهيدر ويُعاد رسمه عند تحديث الأقسام
  let cats = [{ id: 'c1', label: '<b>x</b>' }];
  const H2 = { sanitizeText: v => String(v).replace(/</g, '&lt;').replace(/>/g, '&gt;'), sanitizeUrl: String, getCategories: () => cats };
  const mk = await win.TemplateEngine.load({ design: { template: 'market' } }, { helpers: H2 });
  ck('Market يُحمَّل', mk.id === 'market' && root.attrs['data-template'] === 'market');
  ck('فتحة الأقسام بعد الهيدر (nextSibling)', inserted && inserted.ref === 'SIB');
  const slot = els['tplHeaderSlot'];
  ck('الشريط يحوي القسم ومهرَّب', slot && slot.innerHTML.includes("openCategory('c1')") && !slot.innerHTML.includes('<b>'));
  cats = [{ id: 'c1', label: 'أ' }, { id: 'c2', label: 'ب' }];
  win.TemplateEngine.refreshSlots();
  ck('refreshSlots يعيد رسم الشريط بالأقسام الجديدة', slot.innerHTML.includes("openCategory('c2')"));
  cats = [];
  win.TemplateEngine.refreshSlots();
  ck('بلا أقسام: الشريط يُفرَّغ', slot.innerHTML === '');
  process.exit(bad ? 1 : 0);
})();
