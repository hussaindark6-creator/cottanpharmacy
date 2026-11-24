/* admin-studio-hero.js — واجهة «منطقة التعريف (تكوين حر)» داخل استوديو التصميم + التراجع/الإعادة + المسودة التلقائية.
   تعمل فوق admin-studio.js (نفس النطاق العام) ولا تغيّر آلية الحفظ: heroDesign يُرسل مع look/colors/copy إلى /api/admin/look/save
   ويُنقّى في الووركر. كل الحقول هنا مقيّدة بقوائم مسموحة أو ألوان HEX أو نصوص قصيرة أو صور ترفعها الصيدلية. */

let stuHero = null;            // heroDesign الحالي (مطبَّع) أو null إن لم يُلمس بعد
let stuSavedHero = '';         // JSON للمنشور سابقاً ('' = لا يوجد)
let stuHeroTouched = false, stuHeroSaved = false;
let stuHeroOpen = { el: -1, sl: -1, cd: -1 };
let stuHeroBound = false;

const STU_HERO_MODES = [
  ['classic', 'الحالي', 'سلايدر الصور الافتراضي'],
  ['overlay', 'صورة مع نص', 'صورة بعرض كامل ونص فوقها'],
  ['split', 'صورة ونص منفصلان', 'صورة بجانب بطاقة نصية'],
  ['brand', 'هوية الشعار', 'مساحة شعار كبيرة + عنوان تعريفي'],
  ['editorial', 'تحريري', 'عنوان ضخم وصور بأحجام مختلفة'],
  ['cards', 'بطاقات', 'بطاقة رئيسية وبطاقات أصغر'],
  ['slides', 'شرائح', 'شرائح صور ونصوص وشعار'],
  ['minimal', 'بسيط', 'شعار صغير وعنوان ومساحات بيضاء']
];
const STU_HERO_SETS = {
  overlay: ['img', 'fit', 'overlay', 'ovl', 'pos', 'size', 'radius', 'gap'],
  split: ['img', 'fit', 'ratio', 'side', 'pos', 'size', 'radius', 'gap', 'shadow'],
  brand: ['card', 'stage', 'pos', 'radius', 'gap', 'shadow'],
  editorial: ['img', 'img2', 'img3', 'fit', 'pos', 'size', 'radius', 'gap'],
  cards: ['pos', 'radius', 'gap'],
  slides: ['fit', 'overlay', 'ovl', 'pos', 'size', 'radius'],
  minimal: ['pos', 'radius', 'gap']
};
const STU_HERO_COLORS = {
  overlay: ['bg', 'ink', 'accent'], split: ['bg2', 'ink', 'accent'], brand: ['bg', 'bg2', 'ink', 'accent'], editorial: ['bg', 'ink', 'accent'],
  cards: ['ink', 'accent'], slides: ['bg', 'ink', 'accent'], minimal: ['bg', 'ink', 'accent']
};
const STU_HERO_COLOR_LABELS = { bg: 'لون الخلفية', bg2: 'لون البطاقة/اللوحة', ink: 'لون النص', accent: 'لون الإبراز' };
const STU_HERO_ENUM_LABELS = {
  fit: ['طريقة احتواء الصورة', [['cover', 'ملء المساحة'], ['contain', 'احتواء كامل']]],
  ratio: ['أبعاد الصورة', [['wide', 'عريضة'], ['square', 'مربعة'], ['portrait', 'طولية'], ['tall', 'طولية جداً']]],
  pos: ['موضع النص', [['start', 'يمين'], ['center', 'وسط'], ['end', 'يسار']]],
  side: ['مكان الصورة', [['start', 'على اليمين'], ['end', 'على اليسار']]],
  size: ['ارتفاع المنطقة', [['compact', 'مضغوط'], ['standard', 'عادي'], ['tall', 'طويل'], ['immersive', 'غامر']]],
  radius: ['الزوايا', [['sharp', 'حادة'], ['soft', 'ناعمة'], ['round', 'دائرية'], ['pill', 'كبسولة']]],
  overlay: ['الطبقة فوق الصورة', [['none', 'بدون'], ['soft', 'فاتحة'], ['dark', 'داكنة'], ['brand', 'بلون المتجر']]],
  gap: ['المسافات الداخلية', [['s', 'ضيقة'], ['m', 'متوسطة'], ['l', 'واسعة']]],
  shadow: ['الظل', [['none', 'بدون'], ['soft', 'ناعم'], ['lift', 'بارز']]],
  card: ['بطاقة خلف الشعار', [['on', 'مع بطاقة'], ['off', 'بدون']]],
  stage: ['ارتفاع مساحة الشعار', [['s', 'صغيرة'], ['m', 'متوسطة'], ['l', 'كبيرة']]]
};
const STU_EL_LABELS = { logo: 'الشعار', title: 'عنوان', subtitle: 'عنوان فرعي', text: 'وصف', button: 'زر', badge: 'شارة', icon: 'أيقونة', divider: 'فاصل زخرفي', spacer: 'مساحة فارغة', image: 'صورة' };
const STU_GO_LABELS = [['listing', 'كل المنتجات'], ['offers', 'العروض'], ['bundles', 'البكجات'], ['categories', 'الأقسام'], ['new', 'وصل حديثاً'], ['none', 'بدون رابط']];
const STU_SIZE4 = [['s', 'صغير'], ['m', 'متوسط'], ['l', 'كبير'], ['xl', 'ضخم']];

function stuHeroNorm(x) { return STU_R.normalizeHeroDesign(x) || STU_R.normalizeHeroDesign({ mode: 'classic' }); }
function stuHeroCur() { if (!stuHero) stuHero = stuHeroNorm(null); return stuHero; }
function stuHeroLoad(pp) {
  stuHeroSaved = !!(pp && pp.heroDesign && typeof pp.heroDesign === 'object');
  stuHero = stuHeroNorm(pp && pp.heroDesign);
  stuSavedHero = stuHeroSaved ? JSON.stringify(stuHero) : '';
  stuHeroTouched = false; stuHeroOpen = { el: -1, sl: -1, cd: -1 };
}
function stuHeroPayload() { return (stuHeroTouched || stuHeroSaved) ? stuHeroCur() : undefined; }
function stuHeroDirty() { return stuHeroTouched && JSON.stringify(stuHeroCur()) !== (stuSavedHero || JSON.stringify(stuHeroNorm(null))); }
function stuHeroAfterSave(saved) {
  stuHero = stuHeroNorm(saved); stuSavedHero = JSON.stringify(stuHero); stuHeroSaved = true; stuHeroTouched = false;
  if (typeof pharmacyProfile !== 'undefined') pharmacyProfile.heroDesign = saved;
}
function stuHeroRevert() { try { stuHero = stuSavedHero ? JSON.parse(stuSavedHero) : stuHeroNorm(null); } catch (e) { stuHero = stuHeroNorm(null); } stuHeroTouched = false; }
function stuHeroReset() { stuHero = stuHeroNorm(null); stuHeroTouched = true; }
function stuHeroEls() { const h = stuHeroCur(); return Array.isArray(h.els) ? h.els : STU_R.heroDefaultEls(h.mode); }
function stuHeroMaterialize() { const h = stuHeroCur(); if (!Array.isArray(h.els)) h.els = STU_R.heroDefaultEls(h.mode); return h.els; }

// ---------- صور مصغّرة للتكوينات ----------
function stuHeroThumb(m) {
  const A = 'var(--accent,#0f6b3a)', G = '#dfe6e1', D = '#9aa5a0', W = '#fff';
  const bar = function (x, y, w, c, h) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + (h || 4) + '" rx="2" fill="' + (c || D) + '"/>'; };
  const btn = function (x, y, c) { return '<rect x="' + x + '" y="' + y + '" width="26" height="9" rx="4.5" fill="' + (c || A) + '"/>'; };
  let b = '';
  switch (m) {
    case 'classic': b = '<rect x="4" y="4" width="112" height="56" rx="8" fill="' + G + '"/>' + bar(70, 18, 36, A, 5) + bar(66, 28, 40) + btn(80, 40) + '<circle cx="32" cy="32" r="16" fill="' + W + '"/><circle cx="52" cy="66" r="2" fill="' + A + '"/><circle cx="60" cy="66" r="2" fill="' + D + '"/><circle cx="68" cy="66" r="2" fill="' + D + '"/>'; break;
    case 'overlay': b = '<rect x="4" y="4" width="112" height="64" rx="8" fill="#5b6a63"/><circle cx="34" cy="30" r="18" fill="#788a82"/>' + bar(66, 20, 42, W, 6) + bar(76, 32, 32, '#d8e0dc') + btn(82, 46, W); break;
    case 'split': b = '<rect x="4" y="4" width="56" height="64" rx="8" fill="#9fb8ae"/><circle cx="32" cy="36" r="14" fill="#c4d6ce"/><rect x="60" y="4" width="56" height="64" rx="8" fill="#f4ede2"/>' + bar(70, 22, 36, A, 5) + bar(70, 34, 30) + btn(80, 46); break;
    case 'brand': b = '<rect x="4" y="4" width="112" height="34" rx="8" fill="' + G + '"/><rect x="34" y="9" width="52" height="24" rx="8" fill="' + W + '"/><circle cx="50" cy="21" r="7" fill="' + A + '"/>' + bar(62, 19, 18) + bar(72, 46, 38, A, 6) + bar(62, 46, 8, D, 6) + bar(76, 57, 30) + btn(80, 64, A); break;
    case 'editorial': b = bar(70, 12, 40, A, 3) + bar(60, 22, 50, '#33403a', 8) + bar(70, 36, 40) + btn(84, 50, 'none') + '<rect x="84" y="46" width="26" height="9" rx="4.5" fill="none" stroke="' + A + '"/><rect x="8" y="8" width="34" height="44" rx="5" fill="#c9a2b0"/><rect x="44" y="30" width="16" height="26" rx="4" fill="#9fb8ae"/><rect x="14" y="56" width="44" height="14" rx="4" fill="#e6d6a8"/>'; break;
    case 'cards': b = '<rect x="4" y="4" width="54" height="64" rx="7" fill="#c9a2b0"/>' + bar(14, 52, 30, W, 5) + '<rect x="62" y="4" width="26" height="30" rx="6" fill="#9fb8ae"/><rect x="90" y="4" width="26" height="30" rx="6" fill="#fbe3ec"/><rect x="62" y="38" width="54" height="30" rx="6" fill="#e6d6a8"/>'; break;
    case 'slides': b = '<rect x="4" y="4" width="112" height="56" rx="8" fill="#5b6a63"/><circle cx="30" cy="30" r="14" fill="#788a82"/>' + bar(66, 22, 38, W, 6) + btn(78, 38, W) + '<rect x="50" y="64" width="14" height="4" rx="2" fill="' + A + '"/><circle cx="72" cy="66" r="2" fill="' + D + '"/><circle cx="80" cy="66" r="2" fill="' + D + '"/>'; break;
    case 'minimal': b = '<rect x="4" y="4" width="112" height="64" rx="8" fill="' + W + '" stroke="#e6e9e7"/><circle cx="60" cy="16" r="5" fill="' + A + '"/>' + bar(40, 28, 40, '#33403a', 6) + bar(46, 40, 28) + btn(47, 50, A); break;
  }
  return '<svg viewBox="0 0 120 72" class="stk-thumb" aria-hidden="true">' + b + '</svg>';
}

// ---------- مولّدات HTML ----------
function stkSel(h, k, i, val, opts) {
  return '<select data-h="' + h + '" data-k="' + k + '"' + (i !== undefined ? ' data-i="' + i + '"' : '') + '>' +
    opts.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === val ? ' selected' : '') + '>' + stuEsc(o[1]) + '</option>'; }).join('') + '</select>';
}
function stkField(label, inner) { return '<div class="stk-f"><span>' + stuEsc(label) + '</span>' + inner + '</div>'; }
function stkColor(h, k, i, val) {
  return '<span class="stk-color"><input type="color" data-h="' + h + '" data-k="' + k + '"' + (i !== undefined ? ' data-i="' + i + '"' : '') + ' value="' + (val || '#ffffff') + '">' +
    '<button type="button" class="stk-mini' + (val ? '' : ' on') + '" data-h="clr" data-t="' + h + '" data-k="' + k + '"' + (i !== undefined ? ' data-i="' + i + '"' : '') + '>تلقائي</button></span>';
}
function stkImage(t, k, i, url) {
  return '<span class="stk-img">' + (url ? '<img src="' + stuEsc(url) + '" alt="">' : '<i>لا توجد صورة</i>') +
    '<button type="button" class="stk-mini" data-h="pick" data-t="' + t + '" data-k="' + k + '"' + (i !== undefined ? ' data-i="' + i + '"' : '') + '>رفع صورة</button>' +
    (url ? '<button type="button" class="stk-mini stk-del" data-h="rmimg" data-t="' + t + '" data-k="' + k + '"' + (i !== undefined ? ' data-i="' + i + '"' : '') + '>إزالة</button>' : '') + '</span>';
}

function stuHeroModesHtml(cur) {
  return '<div class="stk-modes">' + STU_HERO_MODES.map(function (m) {
    return '<button type="button" class="stk-mode' + (m[0] === cur ? ' on' : '') + '" data-h="mode" data-v="' + m[0] + '">' + stuHeroThumb(m[0]) + '<b>' + m[1] + '</b><small>' + m[2] + '</small></button>';
  }).join('') + '</div>';
}
function stuHeroSettingsHtml(h) {
  const keys = STU_HERO_SETS[h.mode] || [];
  let out = '';
  STU_HERO_COLORS[h.mode].forEach(function (c) { out += stkField(STU_HERO_COLOR_LABELS[c], stkColor('set', c, undefined, h[c])); });
  keys.forEach(function (k) {
    if (k === 'img' || k === 'img2' || k === 'img3') out += stkField(k === 'img' ? 'الصورة الرئيسية' : (k === 'img2' ? 'صورة إضافية ١' : 'صورة إضافية ٢'), stkImage('root', k, undefined, h[k]));
    else if (k === 'ovl') out += stkField('قوة الطبقة (' + h.ovl + '%)', '<input type="range" min="0" max="80" step="5" value="' + h.ovl + '" data-h="set" data-k="ovl">');
    else if (STU_HERO_ENUM_LABELS[k]) out += stkField(STU_HERO_ENUM_LABELS[k][0], stkSel('set', k, undefined, h[k], STU_HERO_ENUM_LABELS[k][1]));
  });
  return '<div class="stk-grid">' + out + '</div>';
}

function stuHeroElEditor(el, i) {
  let f = '';
  if (el.t in { title: 1, subtitle: 1, text: 1, button: 1, badge: 1 }) {
    const ph = { title: 'اتركيه فارغاً لاستخدام اسم المتجر · *كلمة* لإبرازها', subtitle: 'اتركيه فارغاً لاستخدام النص الحالي', text: 'اتركيه فارغاً لاستخدام الوصف الحالي', button: 'تسوّقي الآن', badge: 'مثال: عناية تستحقينها' }[el.t];
    f += (el.t === 'text' ? '<textarea rows="3" data-h="el" data-k="x" data-i="' + i + '" placeholder="' + stuEsc(ph) + '" maxlength="' + STU_R.HERO_EL_MAX[el.t] + '">' + stuEsc(el.x || '') + '</textarea>'
      : '<input type="text" data-h="el" data-k="x" data-i="' + i + '" value="' + stuEsc(el.x || '') + '" placeholder="' + stuEsc(ph) + '" maxlength="' + STU_R.HERO_EL_MAX[el.t] + '">');
  }
  if (el.t === 'icon') f += '<div class="stk-icons">' + STU_R.HERO_ICONS.map(function (ic) { return '<button type="button" class="stk-ic' + (ic === el.x ? ' on' : '') + '" data-h="icon" data-i="' + i + '" data-v="' + ic + '">' + ic + '</button>'; }).join('') + '</div>';
  if (el.t === 'logo') f += stkField('شعار مخصص (اختياري — الافتراضي شعار المتجر)', stkImage('el', 'u', i, el.u));
  if (el.t === 'image') f += stkField('الصورة', stkImage('el', 'u', i, el.u));
  if (el.t === 'button') f += stkField('الوجهة', stkSel('el', 'go', i, el.go, STU_GO_LABELS)) + stkField('شكل الزر', stkSel('el', 'st', i, el.st, [['fill', 'ممتلئ'], ['outline', 'حدود فقط'], ['text', 'نص فقط']]));
  if (el.t === 'badge') f += stkField('شكل الشارة', stkSel('el', 'st', i, el.st, [['soft', 'ناعمة'], ['solid', 'ممتلئة'], ['outline', 'حدود']]));
  if (el.t === 'divider') f += stkField('شكل الفاصل', stkSel('el', 'st', i, el.st, [['line', 'خط قصير'], ['vline', 'خط عمودي'], ['dots', 'نقاط'], ['leaf', 'زخرفة']]));
  f += '<div class="stk-grid">' +
    stkField('الحجم', stkSel('el', 's', i, el.s, STU_SIZE4)) +
    stkField('المحاذاة', stkSel('el', 'a', i, el.a, [['', 'تلقائي'], ['start', 'يمين'], ['center', 'وسط'], ['end', 'يسار']])) +
    stkField('المسافة بعده', stkSel('el', 'sp', i, el.sp, [['s', 'صغيرة'], ['m', 'متوسطة'], ['l', 'كبيرة']])) +
    stkField('يظهر على', stkSel('el', 'v', i, el.v, [['b', 'الجوال والكمبيوتر'], ['m', 'الجوال فقط'], ['d', 'الكمبيوتر فقط']])) +
    (el.t in { title: 1, subtitle: 1, text: 1, button: 1, badge: 1, icon: 1, divider: 1 } ? stkField('اللون', stkColor('el', 'c', i, el.c)) : '') + '</div>';
  return f;
}
function stuHeroElsHtml(h) {
  const els = stuHeroEls();
  const rows = els.map(function (el, i) {
    const open = stuHeroOpen.el === i, sum = (el.x && el.t !== 'icon') ? ' — ' + stuEsc(el.x.slice(0, 22)) : (el.t === 'icon' ? ' ' + el.x : '');
    return '<div class="stk-row' + (open ? ' open' : '') + '"><div class="stk-row-h"><button type="button" class="stk-row-t" data-h="eopen" data-i="' + i + '"><b>' + STU_EL_LABELS[el.t] + '</b><em>' + sum + '</em></button>' +
      '<span class="stk-ops"><button type="button" data-h="eup" data-i="' + i + '" title="أعلى"' + (i === 0 ? ' disabled' : '') + '>↑</button><button type="button" data-h="edown" data-i="' + i + '" title="أسفل"' + (i === els.length - 1 ? ' disabled' : '') + '>↓</button><button type="button" class="stk-del" data-h="edel" data-i="' + i + '" title="حذف">✕</button></span></div>' +
      (open ? '<div class="stk-row-b">' + stuHeroElEditor(el, i) + '</div>' : '') + '</div>';
  }).join('');
  const add = '<div class="stk-add"><span>إضافة عنصر:</span>' + STU_R.HERO_EL_TYPES.map(function (t) { return '<button type="button" class="stk-mini" data-h="eadd" data-v="' + t + '"' + (els.length >= STU_R.HERO_LIMITS.els ? ' disabled' : '') + '>+ ' + STU_EL_LABELS[t] + '</button>'; }).join('') + '</div>';
  const note = (h.mode === 'brand') ? '<p class="stk-note">في تكوين «هوية الشعار»: الشعار والصورة والأيقونة تظهر داخل مساحة الشعار، وبقية العناصر في القسم التعريفي أسفلها.</p>' : '';
  return (rows || '<p class="stk-note">لا توجد عناصر. أضيفي ما تحتاجينه من الأزرار أدناه.</p>') + add + note;
}

function stuHeroListEditor(kind, h) {
  const isS = kind === 'sl', list = (isS ? h.slides : h.cards) || [], max = isS ? STU_R.HERO_LIMITS.slides : STU_R.HERO_LIMITS.cards;
  const rows = list.map(function (c, i) {
    const open = stuHeroOpen[kind] === i;
    return '<div class="stk-row' + (open ? ' open' : '') + '"><div class="stk-row-h"><button type="button" class="stk-row-t" data-h="' + kind + 'open" data-i="' + i + '"><b>' + (isS ? 'شريحة ' : 'بطاقة ') + (i + 1) + '</b><em>' + (c.t ? ' — ' + stuEsc(c.t.slice(0, 20)) : '') + '</em></button>' +
      '<span class="stk-ops"><button type="button" data-h="' + kind + 'up" data-i="' + i + '"' + (i === 0 ? ' disabled' : '') + '>↑</button><button type="button" data-h="' + kind + 'down" data-i="' + i + '"' + (i === list.length - 1 ? ' disabled' : '') + '>↓</button><button type="button" class="stk-del" data-h="' + kind + 'del" data-i="' + i + '">✕</button></span></div>' +
      (open ? '<div class="stk-row-b">' +
        stkField('الصورة', stkImage(kind, 'img', i, c.img)) +
        '<input type="text" data-h="' + kind + '" data-k="t" data-i="' + i + '" value="' + stuEsc(c.t || '') + '" placeholder="العنوان" maxlength="' + (isS ? 60 : 40) + '">' +
        '<input type="text" data-h="' + kind + '" data-k="x" data-i="' + i + '" value="' + stuEsc(c.x || '') + '" placeholder="النص" maxlength="' + (isS ? 160 : 100) + '">' +
        '<input type="text" data-h="' + kind + '" data-k="b" data-i="' + i + '" value="' + stuEsc(c.b || '') + '" placeholder="نص الزر" maxlength="24">' +
        '<div class="stk-grid">' + stkField('الوجهة', stkSel(kind, 'go', i, c.go, STU_GO_LABELS)) + stkField('لون الخلفية', stkColor(kind, 'bg', i, c.bg)) +
        (isS ? stkField('لون النص', stkColor(kind, 'ink', i, c.ink)) + stkField('يعرض الشعار', '<input type="checkbox" data-h="sl" data-k="logo" data-i="' + i + '"' + (c.logo ? ' checked' : '') + '>')
          : stkField('بطاقة رئيسية كبيرة', '<input type="checkbox" data-h="cd" data-k="big" data-i="' + i + '"' + (c.big ? ' checked' : '') + '>')) + '</div></div>' : '') + '</div>';
  }).join('');
  return rows + '<div class="stk-add"><button type="button" class="stk-mini" data-h="' + kind + 'add"' + (list.length >= max ? ' disabled' : '') + '>+ ' + (isS ? 'إضافة شريحة' : 'إضافة بطاقة') + '</button>' +
    (list.length ? '' : '<small> (بدون عناصر يُستخدم الافتراضي' + (isS ? ': شرائح المتجر الحالية' : '') + ')</small>') + '</div>';
}

function stuHeroHtml() {
  const h = stuHeroCur();
  let body = '<p class="stk-note">اختاري شكل منطقة التعريف ثم عدّلي عناصرها بحرية. «الحالي» يُبقي السلايدر الأصلي دون أي تغيير.</p>' + stuHeroModesHtml(h.mode);
  if (h.mode !== 'classic') {
    body += '<div class="stk-sec"><h4>الألوان والتفاصيل</h4>' + stuHeroSettingsHtml(h) + '</div>';
    if (h.mode === 'slides') body += '<div class="stk-sec"><h4>الشرائح</h4>' + stuHeroListEditor('sl', h) + '</div>';
    if (h.mode === 'cards') body += '<div class="stk-sec"><h4>البطاقات</h4>' + stuHeroListEditor('cd', h) + '</div>';
    if (h.mode !== 'slides') body += '<div class="stk-sec"><h4>' + (h.mode === 'cards' ? 'نص مقدّمة فوق البطاقات (اختياري)' : 'عناصر المنطقة') + '</h4>' + stuHeroElsHtml(h) + '</div>';
  }
  return '<div class="stk">' + body + '<input type="file" accept="image/*" id="stkFile" data-h="file" hidden></div>';
}

// ---------- الأحداث ----------
let stuPickCtx = null;
function stuHeroTouch(rerender) { stuHeroTouched = true; if (rerender) stuHeroRefresh(); studioPush(); }
function stuHeroRefresh() {
  const g = document.getElementById('stuBx-hero') || document.querySelector('.st-group[data-gid="x-hero"] .st-group-body');
  if (g) g.innerHTML = stuHeroHtml();
}
function stuMove(arr, i, d) { const j = i + d; if (j < 0 || j >= arr.length) return false; arr.splice(j, 0, arr.splice(i, 1)[0]); return true; }

async function stuUploadImage(file) {
  const f = (typeof compressImageToWebp === 'function') ? await compressImageToWebp(file) : file;
  const fd = new FormData(); fd.append('file', f);
  const headers = { 'X-Pharmacy-Id': stuPid() };
  const u = (typeof auth !== 'undefined' && auth) ? auth.currentUser : (typeof currentUser !== 'undefined' ? currentUser : null);
  if (u) headers['Authorization'] = 'Bearer ' + await u.getIdToken();
  const res = await fetch(WORKER_API_BASE + '/api/upload', { method: 'POST', headers: headers, body: fd });
  const d = await res.json().catch(function () { return {}; });
  if (!d || !d.success || !d.imageUrl) throw new Error((d && d.message) || 'فشل رفع الصورة');
  return d.imageUrl;
}
function stuTarget(ctx) {
  const h = stuHeroCur();
  if (ctx.t === 'root') return h;
  if (ctx.t === 'el') return stuHeroMaterialize()[ctx.i];
  if (ctx.t === 'sl') return h.slides && h.slides[ctx.i];
  if (ctx.t === 'cd') return h.cards && h.cards[ctx.i];
  return null;
}

function stuHeroClick(e) {
  const el = e.target.closest('[data-h]'); if (!el || !el.closest('.stk')) return false;
  const act = el.getAttribute('data-h'), i = +el.getAttribute('data-i'), v = el.getAttribute('data-v');
  if (['set', 'el', 'sl', 'cd'].indexOf(act) !== -1 && el.tagName !== 'BUTTON') return true; // يعالجها input/change
  const h = stuHeroCur();
  switch (act) {
    case 'mode':
      h.mode = v; stuHeroOpen = { el: -1, sl: -1, cd: -1 };
      if (v === 'cards' || v === 'slides') h.els = null; // بطاقات/شرائح: لا عناصر مقدّمة افتراضياً (عناصر التكوين السابق لا تنتقل إليها)
      stuHeroTouch(true); break;
    case 'eopen': stuHeroOpen.el = stuHeroOpen.el === i ? -1 : i; stuHeroRefresh(); break;
    case 'eup': if (stuMove(stuHeroMaterialize(), i, -1)) { stuHeroOpen.el = -1; stuHeroTouch(true); } break;
    case 'edown': if (stuMove(stuHeroMaterialize(), i, 1)) { stuHeroOpen.el = -1; stuHeroTouch(true); } break;
    case 'edel': stuHeroMaterialize().splice(i, 1); stuHeroOpen.el = -1; stuHeroTouch(true); break;
    case 'eadd': { const els = stuHeroMaterialize(); if (els.length >= STU_R.HERO_LIMITS.els) break; const n = STU_R.normalizeHeroEl({ t: v }); if (v === 'title') n.s = 'l'; els.push(n); stuHeroOpen.el = els.length - 1; stuHeroTouch(true); break; }
    case 'icon': stuHeroMaterialize()[i].x = v; stuHeroTouch(true); break;
    case 'clr': { const o = stuTarget({ t: el.getAttribute('data-t') === 'set' ? 'root' : el.getAttribute('data-t'), i: i }); if (o) { o[el.getAttribute('data-k')] = ''; stuHeroTouch(true); } break; }
    case 'slopen': stuHeroOpen.sl = stuHeroOpen.sl === i ? -1 : i; stuHeroRefresh(); break;
    case 'cdopen': stuHeroOpen.cd = stuHeroOpen.cd === i ? -1 : i; stuHeroRefresh(); break;
    case 'sladd': case 'cdadd': {
      const isS = act === 'sladd', key = isS ? 'slides' : 'cards'; if (!Array.isArray(h[key])) h[key] = [];
      if (h[key].length >= STU_R.HERO_LIMITS[key]) break;
      h[key].push(isS ? { img: '', t: 'عنوان الشريحة', x: '', b: 'تسوّقي الآن', go: 'listing', bg: '', ink: '', logo: false } : { img: '', t: 'عنوان البطاقة', x: '', b: '', go: 'listing', bg: '', big: h[key].length === 0 });
      stuHeroOpen[isS ? 'sl' : 'cd'] = h[key].length - 1; stuHeroTouch(true); break;
    }
    case 'slup': case 'cdup': case 'sldown': case 'cddown': { const key = act.indexOf('sl') === 0 ? 'slides' : 'cards'; if (stuMove(h[key], i, act.slice(-2) === 'up' ? -1 : 1)) stuHeroTouch(true); break; }
    case 'sldel': case 'cddel': { const key = act === 'sldel' ? 'slides' : 'cards'; h[key].splice(i, 1); stuHeroTouch(true); break; }
    case 'pick': stuPickCtx = { t: el.getAttribute('data-t'), k: el.getAttribute('data-k'), i: i }; { const f = document.getElementById('stkFile'); if (f) { f.value = ''; f.click(); } } break;
    case 'rmimg': { const o = stuTarget({ t: el.getAttribute('data-t'), i: i }); if (o) { o[el.getAttribute('data-k')] = ''; stuHeroTouch(true); } break; }
    default: return false;
  }
  return true;
}

async function stuHeroInput(e) {
  const el = e.target.closest('[data-h]'); if (!el || !el.closest('.stk')) return false;
  const act = el.getAttribute('data-h'), k = el.getAttribute('data-k'), i = +el.getAttribute('data-i');
  if (el.id === 'stkFile' && e.type === 'change') {
    const file = el.files && el.files[0]; if (!file || !stuPickCtx) return true;
    const ctx = stuPickCtx;
    try {
      if (typeof showToast === 'function') showToast('جارٍ رفع الصورة... ⏳');
      const url = await stuUploadImage(file); const o = stuTarget(ctx); if (o) { o[ctx.k] = url; stuHeroTouch(true); }
      if (typeof showToast === 'function') showToast('✅ تم رفع الصورة');
    } catch (err) { if (typeof showToast === 'function') showToast('⚠️ ' + (err.message || 'فشل الرفع')); }
    return true;
  }
  if (['set', 'el', 'sl', 'cd'].indexOf(act) === -1) return false;
  const isText = el.tagName === 'INPUT' && el.type === 'text' || el.tagName === 'TEXTAREA';
  if (e.type === 'change' && isText) return true; // النص يُحدَّث أثناء الكتابة (input) فقط
  let val = el.type === 'checkbox' ? el.checked : el.value;
  const h = stuHeroCur();
  let o = act === 'set' ? h : (act === 'el' ? stuHeroMaterialize()[i] : (act === 'sl' ? h.slides[i] : h.cards[i]));
  if (!o) return true;
  if (k === 'ovl') val = Math.max(0, Math.min(80, parseInt(val, 10) || 0));
  o[k] = val;
  // إعادة بناء الواجهة فقط عند ما يغيّر مظهرها (قوائم/ألوان/مربعات)، لا أثناء الكتابة كي لا يضيع التركيز
  stuHeroTouched = true;
  if (el.tagName === 'SELECT' || el.type === 'checkbox' || (el.type === 'color' && e.type === 'change')) stuHeroRefresh();
  else if (k === 'ovl') { const lab = el.closest('.stk-f'); if (lab) lab.firstElementChild.textContent = 'قوة الطبقة (' + val + '%)'; }
  studioPush();
  return true;
}

function stuHeroBind() {
  if (stuHeroBound) return;
  const host = stuEl('studioControls'); if (!host) return;
  host.addEventListener('click', function (e) { stuHeroClick(e); });
  host.addEventListener('input', function (e) { if (e.target.type !== 'file') stuHeroInput(e); });
  host.addEventListener('change', function (e) { stuHeroInput(e); });
  stuHeroBound = true;
}

// ---------- التراجع / الإعادة / المسودة ----------
const stuHist = { stack: [], idx: -1, lock: false, t: null };
function stuSnap() { return JSON.stringify({ look: stuLook, hero: stuHero, ht: stuHeroTouched, blocks: stuBlocks, bt: stuBlocksTouched, copy: stuCopy }); }
function stuHistBtns() {
  const u = stuEl('studioUndoBtn'), r = stuEl('studioRedoBtn');
  if (u) u.disabled = stuHist.idx <= 0;
  if (r) r.disabled = stuHist.idx >= stuHist.stack.length - 1;
}
function stuHistReset() { clearTimeout(stuHist.t); stuHist.stack = [stuSnap()]; stuHist.idx = 0; stuHistBtns(); }
function stuHistNote() {
  if (stuHist.lock) return;
  clearTimeout(stuHist.t);
  stuHist.t = setTimeout(function () {
    const s = stuSnap(); if (stuHist.stack[stuHist.idx] === s) return;
    stuHist.stack = stuHist.stack.slice(0, stuHist.idx + 1); stuHist.stack.push(s);
    if (stuHist.stack.length > 60) stuHist.stack.shift();
    stuHist.idx = stuHist.stack.length - 1; stuHistBtns();
    try { localStorage.setItem('studio_draft_' + stuPid(), s); } catch (e) { /* غير حرج */ }
  }, 450);
}
function stuHistGo(d) {
  const i = stuHist.idx + d; if (i < 0 || i >= stuHist.stack.length) return;
  clearTimeout(stuHist.t); stuHist.idx = i; stuApplySnap(stuHist.stack[i]);
}
function stuApplySnap(s) {
  const o = JSON.parse(s); stuHist.lock = true;
  stuLook = STU_R.normalizeLook(o.look); stuHero = o.hero ? stuHeroNorm(o.hero) : null; stuHeroTouched = !!o.ht;
  stuBlocks = STU_R.normalizeHomeBlocks(o.blocks); stuBlocksTouched = !!o.bt; stuCopy = STU_R.normalizeCopy(o.copy);
  stuRenderExtras(); stuRefreshChips(); studioPush();
  stuHist.lock = false; stuHistBtns();
}
function studioUndo() { stuHistGo(-1); }
function studioRedo() { stuHistGo(1); }
function stuDraftClear() { try { localStorage.removeItem('studio_draft_' + stuPid()); } catch (e) { /* غير حرج */ } const b = document.getElementById('stuDraftBar'); if (b) b.remove(); }
function stuDraftOffer() {
  let d = null; try { d = localStorage.getItem('studio_draft_' + stuPid()); } catch (e) { return; }
  const old = document.getElementById('stuDraftBar'); if (old) old.remove();
  if (!d || d === stuHist.stack[0]) return;
  const host = stuEl('studioControls'); if (!host) return;
  host.insertAdjacentHTML('afterbegin', '<div class="stk-draft" id="stuDraftBar"><span>📝 لديكِ مسودة غير منشورة من جلسة سابقة.</span><button type="button" class="stk-mini on" onclick="stuDraftRestore()">استعادة المسودة</button><button type="button" class="stk-mini" onclick="stuDraftClear()">تجاهل</button></div>');
}
function stuDraftRestore() {
  let d = null; try { d = localStorage.getItem('studio_draft_' + stuPid()); } catch (e) { return; }
  if (!d) return; stuApplySnap(d); stuHistNote();
  const b = document.getElementById('stuDraftBar'); if (b) b.remove();
}
