(() => {
  'use strict';
  const STORAGE_KEY = 'apira_language';
  const SUPPORTED = new Set(['en', 'fa']);
  let messages = window.__APIRA_FA_MESSAGES__ || {};
  let currentLanguage = SUPPORTED.has(localStorage.getItem(STORAGE_KEY)) ? localStorage.getItem(STORAGE_KEY) : 'en';

  const originalText = new WeakMap();
  const translatedText = new WeakMap();
  const originalAttrs = new WeakMap();
  const translatedAttrs = new WeakMap();
  const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA', 'NOSCRIPT']);

  const patterns = [
    [/^(\d+) items?$/i, '$1 مورد'],
    [/^(\d+) files?$/i, '$1 فایل'],
    [/^(\d+) folders?$/i, '$1 پوشه'],
    [/^(\d+) lines?$/i, '$1 خط'],
    [/^(\d+) seconds?$/i, '$1 ثانیه'],
    [/^(\d+) minutes?$/i, '$1 دقیقه'],
    [/^(\d+) hours?$/i, '$1 ساعت'],
    [/^(\d+) days?$/i, '$1 روز'],
    [/^(\d+) updates?$/i, '$1 به‌روزرسانی'],
    [/^(\d+) rule\(s\)$/i, '$1 قانون'],
    [/^(\d+) listener\(s\)$/i, '$1 شنونده'],
    [/^(\d+) publicly bound$/i, '$1 مورد عمومی'],
    [/^(\d+) failed attempt\(s\)$/i, '$1 تلاش ناموفق'],
    [/^(\d+) security update\(s\)$/i, '$1 به‌روزرسانی امنیتی'],
    [/^Last checked (.+)$/i, 'آخرین بررسی: $1'],
    [/^Last updated (.+)$/i, 'آخرین به‌روزرسانی: $1'],
    [/^Updated (.+)$/i, 'به‌روزرسانی‌شده: $1'],
    [/^Created (.+)$/i, 'ساخته‌شده: $1'],
    [/^Modified (.+)$/i, 'ویرایش‌شده: $1'],
    [/^Installed version$/i, 'نسخه نصب‌شده'],
    [/^Latest version$/i, 'آخرین نسخه'],
    [/^Version (.+)$/i, 'نسخه $1'],
    [/^Load: (.+)$/i, 'بار: $1'],
    [/^(.+) available$/i, '$1 در دسترس'],
    [/^(.+) used$/i, '$1 استفاده‌شده'],
    [/^(.+) free$/i, '$1 آزاد'],
    [/^(.+) ago$/i, '$1 پیش'],
    [/^Port (\d+)$/i, 'پورت $1'],
    [/^HTTP (\d+)$/i, 'HTTP $1'],
    [/^Error: (.+)$/i, 'خطا: $1'],
    [/^Failed: (.+)$/i, 'ناموفق: $1'],
    [/^Success: (.+)$/i, 'موفق: $1'],
    [/^Loading (.+)$/i, 'در حال بارگذاری $1'],
    [/^Searching (.+)$/i, 'در حال جست‌وجوی $1'],
    [/^No (.+) found$/i, '$1 پیدا نشد'],
    [/^No (.+) yet$/i, 'هنوز $1 وجود ندارد'],
    [/^Delete (.+)$/i, 'حذف $1'],
    [/^Remove (.+)$/i, 'حذف $1'],
    [/^Edit (.+)$/i, 'ویرایش $1'],
    [/^Create (.+)$/i, 'ساخت $1'],
    [/^Add (.+)$/i, 'افزودن $1'],
    [/^Save (.+)$/i, 'ذخیره $1'],
    [/^Run (.+)$/i, 'اجرای $1'],
    [/^Open (.+)$/i, 'باز کردن $1'],
    [/^Close (.+)$/i, 'بستن $1'],
    [/^Refresh (.+)$/i, 'تازه‌سازی $1'],
    [/^Download (.+)$/i, 'دانلود $1'],
    [/^Upload (.+)$/i, 'آپلود $1'],
    [/^Copy (.+)$/i, 'کپی $1'],
    [/^Move (.+)$/i, 'انتقال $1'],
    [/^Start (.+)$/i, 'شروع $1'],
    [/^Stop (.+)$/i, 'توقف $1'],
    [/^Restart (.+)$/i, 'راه‌اندازی مجدد $1'],
    [/^Enable (.+)$/i, 'فعال‌کردن $1'],
    [/^Disable (.+)$/i, 'غیرفعال‌کردن $1'],
    [/^Test (.+)$/i, 'تست $1'],
    [/^Manage (.+)$/i, 'مدیریت $1'],
    [/^(.+) failed$/i, '$1 ناموفق بود'],
    [/^(.+) completed$/i, '$1 انجام شد'],
    [/^(.+) updated$/i, '$1 به‌روزرسانی شد'],
    [/^(.+) deleted$/i, '$1 حذف شد'],
    [/^(.+) created$/i, '$1 ساخته شد'],
    [/^(.+) installed$/i, '$1 نصب شد'],
    [/^(.+) is already installed\.?$/i, '$1 از قبل نصب شده است.'],
    [/^Are you sure you want to (.+)\?$/i, 'مطمئنی می‌خواهی $1؟']
  ];

  const wordMap = {
    'server':'سرور','system':'سیستم','service':'سرویس','services':'سرویس‌ها','security':'امنیت','settings':'تنظیمات',
    'account':'حساب','access':'دسترسی','panel':'پنل','control':'کنترل','dashboard':'داشبورد','overview':'نمای کلی',
    'status':'وضعیت','active':'فعال','inactive':'غیرفعال','enabled':'فعال','disabled':'غیرفعال','available':'در دسترس',
    'installed':'نصب‌شده','install':'نصب','update':'به‌روزرسانی','updates':'به‌روزرسانی‌ها','version':'نسخه','latest':'آخرین',
    'current':'فعلی','file':'فایل','files':'فایل‌ها','folder':'پوشه','folders':'پوشه‌ها','manager':'مدیریت',
    'terminal':'ترمینال','network':'شبکه','backup':'بکاپ','restore':'بازیابی','resource':'منبع','resources':'منابع',
    'memory':'حافظه','disk':'دیسک','swap':'سواپ','cpu':'CPU','usage':'مصرف','load':'بار','process':'پردازش','processes':'پردازش‌ها',
    'port':'پورت','ports':'پورت‌ها','public':'عمومی','local':'محلی','firewall':'فایروال','password':'رمزعبور','username':'نام‌کاربری',
    'login':'ورود','logout':'خروج','sign':'ورود','failed':'ناموفق','warning':'هشدار','critical':'بحرانی','normal':'عادی',
    'healthy':'سالم','health':'سلامت','action':'عملیات','actions':'عملیات','recommended':'پیشنهادی','details':'جزئیات','detail':'جزئیات',
    'activity':'فعالیت','history':'تاریخچه','logs':'لاگ‌ها','log':'لاگ','search':'جست‌وجو','refresh':'تازه‌سازی','open':'بازکردن',
    'close':'بستن','cancel':'لغو','save':'ذخیره','delete':'حذف','remove':'حذف','edit':'ویرایش','create':'ساخت','add':'افزودن',
    'copy':'کپی','move':'انتقال','download':'دانلود','upload':'آپلود','run':'اجرا','start':'شروع','stop':'توقف','restart':'راه‌اندازی‌مجدد',
    'enable':'فعال‌کردن','disable':'غیرفعال‌کردن','name':'نام','type':'نوع','size':'حجم','time':'زمان','date':'تاریخ','user':'کاربر',
    'users':'کاربران','group':'گروه','groups':'گروه‌ها','permission':'مجوز','permissions':'مجوزها','owner':'مالک','path':'مسیر',
    'connection':'اتصال','connections':'اتصال‌ها','interface':'رابط','interfaces':'رابط‌ها','route':'مسیر','routes':'مسیرها','gateway':'دروازه',
    'address':'آدرس','addresses':'آدرس‌ها','dns':'DNS','ping':'پینگ','test':'تست','testing':'درحال‌تست','check':'بررسی','checking':'درحال‌بررسی',
    'monitor':'مانیتور','monitoring':'مانیتورینگ','alert':'هشدار','alerts':'هشدارها','rule':'قانون','rules':'قوانین','metric':'متریک','metrics':'متریک‌ها',
    'schedule':'زمان‌بندی','scheduled':'زمان‌بندی‌شده','daily':'روزانه','weekly':'هفتگی','monthly':'ماهانه','hourly':'ساعتی',
    'container':'کانتینر','containers':'کانتینرها','image':'ایمیج','images':'ایمیج‌ها','repository':'مخزن','repositories':'مخزن‌ها',
    'branch':'شاخه','branches':'شاخه‌ها','commit':'کامیت','commits':'کامیت‌ها','task':'وظیفه','tasks':'وظیفه‌ها','session':'نشست','sessions':'نشست‌ها',
    'key':'کلید','keys':'کلیدها','api':'API','request':'درخواست','requests':'درخواست‌ها','documentation':'مستندات','description':'توضیحات',
    'language':'زبان','english':'انگلیسی','persian':'فارسی','select':'انتخاب','change':'تغییر','apply':'اعمال','confirm':'تأیید',
    'yes':'بله','no':'خیر','all':'همه','none':'هیچ','new':'جدید','old':'قدیمی','live':'زنده','ready':'آماده','unknown':'نامشخص',
    'loading':'در حال بارگذاری','working':'در حال انجام','connecting':'در حال اتصال','connected':'متصل','error':'خطا','success':'موفق',
    'secure':'امن','protected':'محافظت‌شده','authentication':'احراز هویت','root':'روت','ssh':'SSH','web':'وب','email':'ایمیل','telegram':'تلگرام'
  };

  function preserveSpace(source, translated) {
    const lead = source.match(/^\s*/)?.[0] || '';
    const tail = source.match(/\s*$/)?.[0] || '';
    return lead + translated + tail;
  }

  function translateString(source) {
    if (!source || currentLanguage !== 'fa') return source;
    const trimmed = String(source).trim();
    if (!trimmed || !/[A-Za-z]/.test(trimmed)) return source;
    if (messages[trimmed]) return preserveSpace(source, messages[trimmed]);
    for (const [pattern, replacement] of patterns) {
      if (pattern.test(trimmed)) return preserveSpace(source, trimmed.replace(pattern, replacement));
    }
    let changed = false;
    let out = trimmed.replace(/\b[A-Za-z][A-Za-z-]*\b/g, word => {
      const key = word.toLowerCase();
      if (wordMap[key]) { changed = true; return wordMap[key]; }
      return word;
    });
    return changed ? preserveSpace(source, out) : source;
  }

  function shouldSkip(node) {
    const parent = node.parentElement;
    if (!parent) return true;
    if (parent.closest('[data-i18n-skip]')) return true;
    return SKIP_TAGS.has(parent.tagName);
  }

  function translateTextNode(node, externalChange = false) {
    if (shouldSkip(node)) return;
    const now = node.nodeValue;
    if (!now || !/[A-Za-z]/.test(now)) return;
    if (externalChange || !originalText.has(node)) originalText.set(node, now);
    const original = originalText.get(node);
    const next = translateString(original);
    if (next !== now) {
      translatedText.set(node, next);
      node.nodeValue = next;
    }
  }

  function attrState(el) {
    let map = originalAttrs.get(el);
    if (!map) { map = {}; originalAttrs.set(el, map); }
    return map;
  }

  function translatedAttrState(el) {
    let map = translatedAttrs.get(el);
    if (!map) { map = {}; translatedAttrs.set(el, map); }
    return map;
  }

  function translateAttributes(el, externalName = null) {
    if (el.closest?.('[data-i18n-skip]')) return;
    for (const name of ATTRS) {
      if (!el.hasAttribute?.(name)) continue;
      const value = el.getAttribute(name) || '';
      const originals = attrState(el);
      if (externalName === name || originals[name] === undefined) originals[name] = value;
      const next = translateString(originals[name]);
      if (next !== value) {
        translatedAttrState(el)[name] = next;
        el.setAttribute(name, next);
      }
    }
  }

  function translateTree(root) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) { translateTextNode(root); return; }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
    if (root.nodeType === Node.ELEMENT_NODE) translateAttributes(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === Node.TEXT_NODE) translateTextNode(node);
      else translateAttributes(node);
    }
  }

  function restoreTree() {
    const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === Node.TEXT_NODE && originalText.has(node)) node.nodeValue = originalText.get(node);
      if (node.nodeType === Node.ELEMENT_NODE) {
        const attrs = originalAttrs.get(node);
        if (attrs) for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
      }
    }
  }

  function applyDirection() {
    const fa = currentLanguage === 'fa';
    document.documentElement.lang = fa ? 'fa' : 'en';
    document.documentElement.dir = fa ? 'rtl' : 'ltr';
    document.body?.classList.toggle('apira-fa', fa);
  }

  function injectStyles() {
    if (document.getElementById('apiraI18nStyle')) return;
    const style = document.createElement('style');
    style.id = 'apiraI18nStyle';
    style.textContent = `
      html[dir="rtl"] body { direction: rtl; }
      html[dir="rtl"] input, html[dir="rtl"] textarea, html[dir="rtl"] select { text-align: right; }
      html[dir="rtl"] input[type="number"], html[dir="rtl"] input[type="text"].mono, html[dir="rtl"] .mono, html[dir="rtl"] code, html[dir="rtl"] pre { direction:ltr; text-align:left; }
      html[dir="rtl"] .sidebar, html[dir="rtl"] .modal, html[dir="rtl"] .panel, html[dir="rtl"] .card { text-align:right; }
      .apira-language-select { min-width:150px; border:1px solid rgba(148,163,184,.25); background:rgba(15,23,42,.75); color:inherit; border-radius:12px; padding:10px 36px 10px 12px; font:inherit; }
      html[dir="rtl"] .apira-language-select { padding:10px 12px 10px 36px; }
    `;
    document.head.appendChild(style);
  }

  function injectLanguageSetting() {
    const panel = document.querySelector('#settings .settings-panel');
    if (!panel || document.getElementById('apiraLanguageSetting')) return;
    const row = document.createElement('div');
    row.className = 'settings-option';
    row.id = 'apiraLanguageSetting';
    row.dataset.i18nSkip = '1';
    row.innerHTML = `
      <div class="settings-option-icon"><i data-lucide="languages"></i></div>
      <div class="settings-option-copy">
        <strong class="apira-lang-title"></strong>
        <span class="apira-lang-desc"></span>
      </div>
      <select class="apira-language-select" aria-label="Language">
        <option value="en">English</option>
        <option value="fa">فارسی</option>
      </select>`;
    panel.insertBefore(row, panel.firstChild);
    const select = row.querySelector('select');
    select.value = currentLanguage;
    select.addEventListener('change', () => setLanguage(select.value));
    updateLanguageSetting();
    window.lucide?.createIcons?.();
  }

  function updateLanguageSetting() {
    const row = document.getElementById('apiraLanguageSetting');
    if (!row) return;
    const fa = currentLanguage === 'fa';
    row.querySelector('.apira-lang-title').textContent = fa ? 'زبان' : 'Language';
    row.querySelector('.apira-lang-desc').textContent = fa ? 'زبان نمایش پنل و همه افزونه‌ها را انتخاب کنید.' : 'Choose the display language for the panel and all extensions.';
    const select = row.querySelector('select');
    if (select) select.value = currentLanguage;
  }

  function setLanguage(language) {
    if (!SUPPORTED.has(language)) language = 'en';
    currentLanguage = language;
    localStorage.setItem(STORAGE_KEY, language);
    applyDirection();
    if (language === 'fa') translateTree(document.documentElement);
    else restoreTree();
    updateLanguageSetting();
    window.dispatchEvent(new CustomEvent('apira-language-changed', { detail: { language } }));
  }

  const observer = new MutationObserver(records => {
    if (currentLanguage !== 'fa') return;
    for (const record of records) {
      if (record.type === 'characterData') {
        const node = record.target;
        if (node.nodeValue === translatedText.get(node)) continue;
        translateTextNode(node, true);
      } else if (record.type === 'attributes') {
        const el = record.target;
        const name = record.attributeName;
        const translated = translatedAttrs.get(el)?.[name];
        if (el.getAttribute(name) === translated) continue;
        translateAttributes(el, name);
      } else {
        for (const node of record.addedNodes) translateTree(node);
      }
    }
  });

  async function boot() {
    injectStyles();
    applyDirection();
    injectLanguageSetting();
    if (currentLanguage === 'fa') translateTree(document.documentElement);
    observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    window.ApiraI18n = { setLanguage, getLanguage: () => currentLanguage, translate: translateString };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
