/* admin-calm.js — تحسين سهولة استخدام إعدادات الهوية: بطاقات قابلة للطيّ + شريط تنقل سريع بين الأقسام */
(function () {
  function enhance() {
    var form = document.querySelector('form[onsubmit^="handleSaveCustomization"]');
    if (!form || form.dataset.acReady) return;
    var sets = Array.prototype.slice.call(form.querySelectorAll(':scope > .admin-fieldset'));
    if (!sets.length) return;
    form.dataset.acReady = '1';
    var nav = document.createElement('div');
    nav.className = 'ac-nav';
    sets.forEach(function (fs, i) {
      var lg = fs.querySelector(':scope > legend');
      if (!lg) return;
      fs.classList.add('ac-ready');
      if (i > 0) fs.classList.add('ac-collapsed');
      lg.setAttribute('role', 'button'); lg.setAttribute('tabindex', '0');
      var toggle = function () { fs.classList.toggle('ac-collapsed'); syncNav(); };
      lg.addEventListener('click', toggle);
      lg.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
      var raw = lg.textContent;
      var label = /اسم الصيدلية|Brand/.test(raw) ? '🎨 الهوية والألوان' : /بانر الصفحة/.test(raw) ? '🖼️ البانر الرئيسي' : /استشارة/.test(raw) ? '🩺 الاستشارة' : /التواصل/.test(raw) ? '📱 التواصل' : /التوصيل/.test(raw) ? '🚚 التوصيل' : raw.replace(/\(.*?\)/g, '').trim();
      var b = document.createElement('button');
      b.type = 'button'; b.textContent = label.length > 26 ? label.slice(0, 24) + '…' : label;
      b.addEventListener('click', function () {
        sets.forEach(function (o) { if (o !== fs) o.classList.add('ac-collapsed'); });
        fs.classList.remove('ac-collapsed'); syncNav();
        setTimeout(function () { fs.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 40);
      });
      b._fs = fs; nav.appendChild(b);
    });
    function syncNav() { Array.prototype.forEach.call(nav.children, function (b) { b.classList.toggle('on', !b._fs.classList.contains('ac-collapsed')); }); }
    form.insertBefore(nav, form.firstChild);
    syncNav();
  }
  window.addEventListener('DOMContentLoaded', function () { enhance(); setTimeout(enhance, 800); });
  document.addEventListener('click', function (e) { if (e.target && e.target.id === 'btnTabVDesign') setTimeout(enhance, 50); });
})();
