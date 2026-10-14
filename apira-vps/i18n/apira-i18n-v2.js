(() => {
  'use strict';
  const KEY = 'apira_language';
  const SUPPORTED = new Set(['en', 'fa']);
  const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  const SKIP = new Set(['SCRIPT','STYLE','CODE','PRE','TEXTAREA','NOSCRIPT']);
  const messages = window.__APIRA_FA_MESSAGES__ || {};
  const queryLang = (() => { try { const v = new URLSearchParams(location.search).get('lang'); return SUPPORTED.has(v) ? v : null; } catch (_) { return null; } })();
  let lang = queryLang || (SUPPORTED.has(localStorage.getItem(KEY)) ? localStorage.getItem(KEY) : 'en');
  if (queryLang) localStorage.setItem(KEY, queryLang);

  const textOriginal = new WeakMap();
  const attrOriginal = new WeakMap();
  const translatedText = new WeakMap();
  const translatedAttr = new WeakMap();
  const patterns = [
    [/^(\d+) items?$/i,'$1 مورد'], [/^(\d+) files?$/i,'$1 فایل'], [/^(\d+) folders?$/i,'$1 پوشه'],
    [/^(\d+) lines?$/i,'$1 خط'], [/^(\d+) seconds?$/i,'$1 ثانیه'], [/^(\d+) minutes?$/i,'$1 دقیقه'],
    [/^(\d+) hours?$/i,'$1 ساعت'], [/^(\d+) days?$/i,'$1 روز'], [/^(\d+) updates?$/i,'$1 به‌روزرسانی'],
    [/^(\d+) rule\(s\)$/i,'$1 قانون'], [/^(\d+) listener\(s\)$/i,'$1 شنونده'], [/^(\d+) publicly bound$/i,'$1 مورد عمومی'],
    [/^(\d+) failed attempt\(s\)$/i,'$1 تلاش ناموفق'], [/^(\d+) security update\(s\)$/i,'$1 به‌روزرسانی امنیتی'],
    [/^Last checked (.+)$/i,'آخرین بررسی: $1'], [/^Last updated (.+)$/i,'آخرین به‌روزرسانی: $1'],
    [/^Version (.+)$/i,'نسخه $1'], [/^Load: (.+)$/i,'بار: $1'], [/^(.+) available$/i,'$1 در دسترس'],
    [/^Port (\d+)$/i,'پورت $1'], [/^Error: (.+)$/i,'خطا: $1'], [/^Failed: (.+)$/i,'ناموفق: $1'],
    [/^Success: (.+)$/i,'موفق: $1'], [/^Loading (.+)$/i,'در حال بارگذاری $1'], [/^Searching (.+)$/i,'در حال جست‌وجوی $1']
  ];

  function spaced(src, out) {
    const a = src.match(/^\s*/)?.[0] || '', b = src.match(/\s*$/)?.[0] || '';
    return a + out + b;
  }
  function tr(src) {
    if (lang !== 'fa' || !src) return src;
    const x = String(src).trim();
    if (!x || !/[A-Za-z]/.test(x)) return src;
    if (messages[x]) return spaced(src, messages[x]);
    for (const [re, out] of patterns) if (re.test(x)) return spaced(src, x.replace(re, out));
    return src;
  }
  function skipText(n) {
    const p = n.parentElement;
    return !p || SKIP.has(p.tagName) || !!p.closest('[data-i18n-skip]');
  }
  function tx(n, external=false) {
    if (skipText(n)) return;
    const now = n.nodeValue || '';
    if (external || !textOriginal.has(n)) textOriginal.set(n, now);
    const next = tr(textOriginal.get(n));
    if (next !== now) { translatedText.set(n, next); n.nodeValue = next; }
  }
  function attrs(el, externalName=null) {
    if (!el?.hasAttribute || el.closest?.('[data-i18n-skip]')) return;
    let originals = attrOriginal.get(el); if (!originals) { originals = {}; attrOriginal.set(el, originals); }
    let translated = translatedAttr.get(el); if (!translated) { translated = {}; translatedAttr.set(el, translated); }
    for (const name of ATTRS) {
      if (!el.hasAttribute(name)) continue;
      const now = el.getAttribute(name) || '';
      if (externalName === name || originals[name] === undefined) originals[name] = now;
      const next = tr(originals[name]);
      if (next !== now) { translated[name] = next; el.setAttribute(name, next); }
    }
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) return tx(root);
    if (![Node.ELEMENT_NODE, Node.DOCUMENT_NODE].includes(root.nodeType)) return;
    if (root.nodeType === Node.ELEMENT_NODE) attrs(root);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) n.nodeType === Node.TEXT_NODE ? tx(n) : attrs(n);
  }
  function restore() {
    const w = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) {
      if (n.nodeType === Node.TEXT_NODE && textOriginal.has(n)) n.nodeValue = textOriginal.get(n);
      if (n.nodeType === Node.ELEMENT_NODE) { const m = attrOriginal.get(n); if (m) for (const [k,v] of Object.entries(m)) n.setAttribute(k,v); }
    }
  }
  function direction() {
    const fa = lang === 'fa';
    document.documentElement.lang = fa ? 'fa' : 'en';
    document.documentElement.dir = fa ? 'rtl' : 'ltr';
    document.body?.classList.toggle('apira-fa', fa);
  }
  function styles() {
    if (document.getElementById('apiraI18nStyle')) return;
    const s=document.createElement('style'); s.id='apiraI18nStyle'; s.textContent=`
      html[dir="rtl"] body{direction:rtl} html[dir="rtl"] input,html[dir="rtl"] textarea,html[dir="rtl"] select{text-align:right}
      html[dir="rtl"] code,html[dir="rtl"] pre,html[dir="rtl"] .mono{direction:ltr;text-align:left}
      html[dir="rtl"] .sidebar,html[dir="rtl"] .modal,html[dir="rtl"] .panel,html[dir="rtl"] .card{text-align:right}
      .apira-language-select{min-width:150px;border:1px solid rgba(148,163,184,.25);background:rgba(15,23,42,.75);color:inherit;border-radius:12px;padding:10px 36px 10px 12px;font:inherit}
      html[dir="rtl"] .apira-language-select{padding:10px 12px 10px 36px}
      .apira-language-panel{margin-bottom:18px}.apira-language-panel-head svg{width:22px;height:22px}.apira-language-panel-body{display:flex;align-items:center;gap:14px;flex-wrap:wrap}.apira-language-panel-body .apira-language-select{margin-inline-start:auto}.apira-language-label{font-weight:700}.apira-language-hint{width:100%;font-size:12px;opacity:.68;line-height:1.7}
      .apira-tool-settings-trigger{position:fixed;right:18px;bottom:18px;z-index:2147483000;display:flex;align-items:center;gap:8px;border:1px solid rgba(148,163,184,.28);border-radius:14px;padding:10px 13px;background:rgba(10,14,28,.92);color:#f8fafc;box-shadow:0 12px 34px rgba(0,0,0,.3);font:inherit;cursor:pointer;backdrop-filter:blur(16px)}.apira-tool-settings-trigger svg{width:18px;height:18px}html[dir="rtl"] .apira-tool-settings-trigger{right:auto;left:18px}
      .apira-tool-settings-modal{position:fixed;inset:0;z-index:2147483001;display:none;place-items:center;padding:18px;background:rgba(2,6,23,.68);backdrop-filter:blur(10px)}.apira-tool-settings-modal.show{display:grid}.apira-tool-settings-dialog{width:min(460px,100%);border:1px solid rgba(148,163,184,.22);border-radius:22px;padding:20px;background:#0d1322;color:#f8fafc;box-shadow:0 24px 70px rgba(0,0,0,.48)}.apira-tool-settings-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:20px}.apira-tool-settings-head>div{display:grid;gap:5px}.apira-tool-settings-title{font-size:20px}.apira-tool-settings-subtitle,.apira-lang-desc{font-size:13px;opacity:.7;line-height:1.65}.apira-tool-settings-close{border:0;background:transparent;color:inherit;font-size:28px;line-height:1;cursor:pointer}.apira-tool-settings-row{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:16px;border:1px solid rgba(148,163,184,.18);border-radius:16px;background:rgba(255,255,255,.035)}.apira-tool-settings-row>div{display:grid;gap:4px}
      @media(max-width:640px){.apira-tool-settings-trigger{bottom:12px;right:12px}.apira-tool-settings-trigger span{display:none}html[dir="rtl"] .apira-tool-settings-trigger{right:auto;left:12px}.apira-tool-settings-row{align-items:stretch;flex-direction:column}.apira-language-panel-body{align-items:stretch;flex-direction:column}.apira-language-panel-body .apira-language-select{margin-inline-start:0;width:100%}}`; document.head.appendChild(s);
  }
  function languageSelectMarkup() {
    return '<select class="apira-language-select" aria-label="Language"><option value="en">English</option><option value="fa">فارسی</option></select>';
  }

  function bindLanguageSelect(root) {
    const select = root?.querySelector?.('.apira-language-select');
    if (!select) return;
    select.value = lang;
    select.addEventListener('change', e => setLanguage(e.target.value));
  }

  function injectIntoNativeSettings() {
    const page = document.querySelector('#settings');
    if (!page || document.getElementById('apiraLanguageSetting')) return false;

    const classicPanel = page.querySelector('.settings-panel');
    if (classicPanel) {
      const row = document.createElement('div');
      row.className = 'settings-option apira-language-native';
      row.id = 'apiraLanguageSetting';
      row.dataset.i18nSkip = '1';
      row.innerHTML = '<div class="settings-option-icon"><i data-lucide="languages"></i></div><div class="settings-option-copy"><strong class="apira-lang-title"></strong><span class="apira-lang-desc"></span></div>' + languageSelectMarkup();
      classicPanel.insertBefore(row, classicPanel.firstChild);
      bindLanguageSelect(row);
      return true;
    }

    const card = document.createElement('section');
    card.className = 'panel apira-language-panel';
    card.id = 'apiraLanguageSetting';
    card.dataset.i18nSkip = '1';
    card.innerHTML = '<div class="panel-header apira-language-panel-head"><div><div class="panel-title apira-lang-title"></div><div class="panel-subtitle apira-lang-desc"></div></div><i data-lucide="languages"></i></div><div class="panel-body apira-language-panel-body"><label class="apira-language-label"></label>' + languageSelectMarkup() + '<div class="apira-language-hint"></div></div>';
    const firstPanel = page.querySelector(':scope > .panel');
    if (firstPanel) page.insertBefore(card, firstPanel);
    else page.appendChild(card);
    bindLanguageSelect(card);
    return true;
  }

  function injectStandaloneSettings() {
    if (document.getElementById('apiraToolSettingsButton')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'apiraToolSettingsButton';
    button.className = 'apira-tool-settings-trigger';
    button.dataset.i18nSkip = '1';
    button.innerHTML = '<i data-lucide="settings"></i><span class="apira-tool-settings-label"></span>';

    const modal = document.createElement('div');
    modal.id = 'apiraToolSettingsModal';
    modal.className = 'apira-tool-settings-modal';
    modal.dataset.i18nSkip = '1';
    modal.innerHTML = '<div class="apira-tool-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="apiraToolSettingsTitle"><div class="apira-tool-settings-head"><div><strong id="apiraToolSettingsTitle" class="apira-tool-settings-title"></strong><span class="apira-tool-settings-subtitle"></span></div><button type="button" class="apira-tool-settings-close" aria-label="Close">×</button></div><div class="apira-tool-settings-row"><div><strong class="apira-lang-title"></strong><span class="apira-lang-desc"></span></div>' + languageSelectMarkup() + '</div><div class="apira-language-hint"></div></div>';

    document.body.append(button, modal);
    bindLanguageSelect(modal);
    const close = () => modal.classList.remove('show');
    button.addEventListener('click', () => { modal.classList.add('show'); updateSetting(); });
    modal.querySelector('.apira-tool-settings-close').addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  }

  function settings() {
    if (!injectIntoNativeSettings()) injectStandaloneSettings();
    updateSetting();
    window.lucide?.createIcons?.();
  }

  function updateSetting(){
    const fa = lang === 'fa';
    document.querySelectorAll('.apira-lang-title').forEach(el => el.textContent = fa ? 'زبان' : 'Language');
    document.querySelectorAll('.apira-lang-desc').forEach(el => el.textContent = fa ? 'زبان نمایش همین ابزار را انتخاب کنید.' : 'Choose the display language for this tool.');
    document.querySelectorAll('.apira-language-label').forEach(el => el.textContent = fa ? 'زبان رابط کاربری' : 'Interface language');
    document.querySelectorAll('.apira-language-hint').forEach(el => el.textContent = fa ? 'این انتخاب با پنل اصلی و بقیه ابزارهای Apira VPS همگام می‌شود.' : 'This selection stays synchronized with the main panel and other Apira VPS tools.');
    document.querySelectorAll('.apira-tool-settings-label').forEach(el => el.textContent = fa ? 'تنظیمات' : 'Settings');
    document.querySelectorAll('.apira-tool-settings-title').forEach(el => el.textContent = fa ? 'تنظیمات ابزار' : 'Tool settings');
    document.querySelectorAll('.apira-tool-settings-subtitle').forEach(el => el.textContent = fa ? 'تنظیمات نمایش و زبان این ابزار' : 'Display and language preferences for this tool');
    document.querySelectorAll('.apira-language-select').forEach(el => el.value = lang);
  }

  let observer, timer=0; const roots=new Set(), texts=new Set(), changedAttrs=new Map();
  const opts={subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:ATTRS};
  const observe=()=>observer?.observe(document.documentElement,opts);
  function flush(){ timer=0; observer.disconnect(); try{ for(const n of texts)tx(n); for(const [e] of changedAttrs)attrs(e); for(const r of roots)walk(r); } finally{ roots.clear();texts.clear();changedAttrs.clear();observe(); } }
  function schedule(){ if(!timer)timer=setTimeout(flush,80); }
  observer=new MutationObserver(rs=>{ if(lang!=='fa')return; for(const r of rs){ if(r.type==='characterData'){if(r.target.nodeValue===translatedText.get(r.target))continue;textOriginal.set(r.target,r.target.nodeValue);texts.add(r.target)}else if(r.type==='attributes'){const e=r.target,n=r.attributeName;if(e.getAttribute(n)===translatedAttr.get(e)?.[n])continue;let m=attrOriginal.get(e);if(!m){m={};attrOriginal.set(e,m)}m[n]=e.getAttribute(n)||'';changedAttrs.set(e,n)}else for(const n of r.addedNodes)roots.add(n)} if(roots.size||texts.size||changedAttrs.size)schedule(); });

  function setLanguage(v,{persist=true}={}){ if(!SUPPORTED.has(v))v='en'; if(persist)localStorage.setItem(KEY,v); const changed=v!==lang; lang=v; observer.disconnect(); try{direction();lang==='fa'?walk(document.documentElement):restore();updateSetting()}finally{observe()} if(changed)window.dispatchEvent(new CustomEvent('apira-language-changed',{detail:{language:lang}})); }
  function sync(){const v=localStorage.getItem(KEY);if(SUPPORTED.has(v)&&v!==lang)setLanguage(v,{persist:false})}
  function tagToolLink(a){if(!a?.href)return;try{const u=new URL(a.href,location.href);if(u.origin!==location.origin)return;if(!/^\/(?:filemanager|wevpsnetwork|backupcenter|resourcesentinel|wevpsapicore|wevpsterminal|wevpsinstaller|wevpsopsdeck)\/?/i.test(u.pathname))return;u.searchParams.set('lang',lang);a.href=u.pathname+u.search+u.hash}catch(_){}}
  function boot(){styles();direction();settings();if(lang==='fa')walk(document.documentElement);observe();window.ApiraI18n={setLanguage,getLanguage:()=>lang,translate:tr};window.addEventListener('storage',e=>{if(e.key===KEY&&SUPPORTED.has(e.newValue)&&e.newValue!==lang)setLanguage(e.newValue,{persist:false})});window.addEventListener('pageshow',sync);document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync()});document.addEventListener('click',e=>tagToolLink(e.target.closest?.('a[href]')),true)}
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot,{once:true}):boot();
})();
