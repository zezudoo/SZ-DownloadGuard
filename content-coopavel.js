// content-coopavel.js
(() => {
  // Mantém o SW informado que esta aba está no host protegido (evita bloquear blob:/data: de outros sites).
  // Importante: roda só no top-frame (o content script está com all_frames=true).
  const isTopFrame = (() => {
    try { return window.top === window; } catch { return true; }
  })();
  if (isTopFrame) {
    const pingProtectedTab = () => {
      try { chrome.runtime?.sendMessage?.({ type: 'sz-tab-ping', url: location.href }); } catch {}
    };
    pingProtectedTab();
    const pingTimer = setInterval(pingProtectedTab, 60_000);
    window.addEventListener('pagehide', () => {
      clearInterval(pingTimer);
      try { chrome.runtime?.sendMessage?.({ type: 'sz-tab-clear' }); } catch {}
    });
  }

  // ======== Estado: enabled + policy ========
  let enabled = true;      // controlado pelas opções
  let hasPolicy = false;   // sem policy => bloqueia tudo (quando enabled)
  let allowedExts = new Set(); // vazio até carregar policy

  const normalizeExt = (value) => {
    const raw = String(value || '').trim().toLowerCase().replace(/^\.+/, '');
    return raw;
  };
  const normalizeExtList = (list) => {
    if (!Array.isArray(list)) return [];
    return list.map(normalizeExt).filter(Boolean);
  };
  const applyPolicy = (policy) => {
    const list = normalizeExtList(policy?.allowed?.extensions);
    if (list.length) {
      hasPolicy = true;
      allowedExts = new Set(list);
    } else {
      hasPolicy = false;
      allowedExts = new Set();
    }
  };

  // carrega enabled + policy
  chrome.storage.local.get(['enabled', 'policy']).then(({ enabled: en, policy }) => {
    if (en === false) enabled = false;
    applyPolicy(policy);
  });

  // observa mudanças em runtime
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (Object.prototype.hasOwnProperty.call(changes, 'enabled')) {
      enabled = changes.enabled.newValue !== false;
    }
    if (Object.prototype.hasOwnProperty.call(changes, 'policy')) {
      applyPolicy(changes.policy?.newValue);
    }
  });

  // ======== Toast in-page ========
  function ensureToastInfra() {
    if (document.getElementById('sz-dl-guard-toast-style')) return;
    const st = document.createElement('style');
    st.id = 'sz-dl-guard-toast-style';
    st.textContent = `
      #sz-dl-guard-toast-host { 
        position: fixed; right: 20px; top: 20px; z-index: 2147483647;
        display: flex; flex-direction: column; gap: 12px; pointer-events: none;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      }
      .sz-dl-guard-toast { 
        background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
        color: #fff; 
        border-radius: 12px;
        padding: 16px 18px; 
        min-width: 300px; 
        max-width: 400px; 
        box-shadow: 0 10px 40px rgba(220, 38, 38, 0.3), 0 4px 12px rgba(0, 0, 0, 0.2);
        border: 1px solid rgba(255, 255, 255, 0.15);
        opacity: 0; 
        transform: translateX(20px) scale(0.95); 
        transition: opacity .3s cubic-bezier(0.4, 0, 0.2, 1), 
                    transform .3s cubic-bezier(0.4, 0, 0.2, 1);
        backdrop-filter: blur(10px);
      }
      .sz-dl-guard-toast.show { 
        opacity: 1; 
        transform: translateX(0) scale(1); 
      }
      .sz-dl-guard-toast-header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 8px;
      }
      .sz-dl-guard-toast-icon {
        font-size: 28px;
        line-height: 1;
        filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
      }
      .sz-dl-guard-toast .title { 
        font-weight: 700; 
        font-size: 15px;
        letter-spacing: -0.01em;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
        flex: 1;
      }
      .sz-dl-guard-toast .msg { 
        font-size: 13px;
        line-height: 1.5;
        opacity: 0.95;
        padding-left: 40px;
        font-weight: 500;
      }
    `;
    (document.head || document.documentElement).appendChild(st);
    const host = document.createElement('div');
    host.id = 'sz-dl-guard-toast-host';
    (document.documentElement || document.body || document.head).appendChild(host);
  }

  function showToast(title, msg) {
    try {
      ensureToastInfra();
      const host = document.getElementById('sz-dl-guard-toast-host');
      if (!host) return;
      const el = document.createElement('div');
      el.className = 'sz-dl-guard-toast';
      const header = document.createElement('div');
      header.className = 'sz-dl-guard-toast-header';

      const icon = document.createElement('div');
      icon.className = 'sz-dl-guard-toast-icon';
      icon.textContent = '🛡️';

      const titleEl = document.createElement('div');
      titleEl.className = 'title';
      titleEl.textContent = title;

      header.append(icon, titleEl);

      const msgEl = document.createElement('div');
      msgEl.className = 'msg';
      msgEl.textContent = msg || '';

      el.append(header, msgEl);
      host.appendChild(el);
      void el.offsetHeight;
      el.classList.add('show');
      setTimeout(() => { 
        el.classList.remove('show'); 
        setTimeout(() => el.remove(), 300); 
      }, 5000); // 5 segundos em tela
    } catch {}
  }

  // ======== Helpers ========
  const PROTECTED_HOST_RE = /^coopavelcoop\.sz\.chat$/i;
  const isProtectedHost = (h) => PROTECTED_HOST_RE.test(String(h || ''));
  const isProtectedUrl = (url) => {
    if (!url) return false;
    try {
      const parsed = new URL(url, location.href);
      if (parsed.protocol === 'blob:' || parsed.protocol === 'data:') return true;
      return parsed.protocol === 'https:' && isProtectedHost(parsed.hostname);
    } catch {
      return false;
    }
  };
  const looksLikeDownloadEndpoint = (url) => {
    try {
      const parsed = new URL(url, location.href);
      if (/(^|\/)(download|attachment|export)(\/|$)/i.test(parsed.pathname)) return true;
      if (parsed.searchParams.has('download')) return true;
      if (parsed.searchParams.has('attachment')) return true;
      if (parsed.searchParams.has('dl')) return true;
      return false;
    } catch {
      return false;
    }
  };

  const extFromFilename = (name) => {
    if (!name) return '';
    const clean = String(name).trim();
    if (!clean) return '';
    const last = clean.split(/[\\/]/).pop() || '';
    const dot = last.lastIndexOf('.');
    if (dot <= 0) return '';
    return normalizeExt(last.slice(dot + 1));
  };
  const extFromUrl = (url) => { try { return extFromFilename(new URL(url, location.href).pathname); } catch { return ''; } };

  // sem policy => bloquear tudo; com policy => liberar extensão permitida; sem extensão => deixa o SW decidir
  const shouldBlockByExt = (href, downloadAttr) => {
    if (!enabled) return false; // desativado → nunca bloquear
    if (!hasPolicy) return true;
    const ext = (downloadAttr && extFromFilename(downloadAttr)) || extFromUrl(href);
    if (!ext) return false;
    return !allowedExts.has(ext);
  };

  const BLOCK = (why, details) => {
    // se estiver desativado, não faz nada
    if (!enabled) return;
    showToast('SZ Chat - Download Guard Coopavel', details || 'Download bloqueado pela política aplicada');
    try { chrome.runtime?.sendMessage?.({ type: 'sz-blocked-notify', why, details }); } catch {}
  };

  // ======== Interceptores ========
  function onAnchorClick(e, anchor) {
    if (!enabled) return; // toggle OFF → passa tudo
    const href = anchor.getAttribute('href') || anchor.href || '';
    if (!isProtectedUrl(href)) return;
    
    // Ignora se for navegação normal (sem download attribute e sem extensão de arquivo na URL)
    const dn = anchor.getAttribute('download') || anchor.download || '';
    if (!dn && !extFromUrl(href) && !looksLikeDownloadEndpoint(href)) return; // navegação normal, não é download
    
    if (shouldBlockByExt(href, dn)) {
      e.preventDefault(); e.stopImmediatePropagation(); e.stopPropagation();
      const ext = (dn && extFromFilename(dn)) || extFromUrl(href) || 'desconhecido';
      BLOCK('anchor', hasPolicy ? `Download bloqueado: extensão .${ext} bloqueada pela política aplicada` : 'Download bloqueado: nenhuma política carregada');
    }
  }

  // clique do usuário
  window.addEventListener('click', (e) => {
    if (!enabled) return;
    const a = e.target?.closest?.('a[href]');
    if (!a) return;
    onAnchorClick(e, a);
  }, true);

  // clique programático
  const _aClick = HTMLAnchorElement.prototype.click;
  Object.defineProperty(HTMLAnchorElement.prototype, 'click', {
    configurable: true, writable: true,
    value: function(...args) {
      if (!enabled) return _aClick.apply(this, args);
      const href = this.getAttribute('href') || this.href || '';
      if (isProtectedUrl(href)) {
        const dn = this.getAttribute('download') || this.download || '';
        // Ignora se for navegação normal (sem download attribute e sem extensão de arquivo)
        if (!dn && !extFromUrl(href) && !looksLikeDownloadEndpoint(href)) return _aClick.apply(this, args);
        
        if (shouldBlockByExt(href, dn)) {
          const ext = (dn && extFromFilename(dn)) || extFromUrl(href) || 'desconhecido';
          BLOCK('anchor-programmatic', hasPolicy ? `Download bloqueado: extensão .${ext} bloqueada pela política aplicada` : 'Download bloqueado: nenhuma política carregada');
          return; // bloqueado
        }
      }
      return _aClick.apply(this, args);
    }
  });

  // window.open
  const _open = window.open;
  Object.defineProperty(window, 'open', {
    configurable: true, writable: true,
    value: function(url, ...rest) {
      if (!enabled) return _open.call(window, url, ...rest);
      const s = String(url || '');
      // Bloqueia quando a URL já parece um endpoint de download.
      if (isProtectedUrl(s) && (extFromUrl(s) || looksLikeDownloadEndpoint(s)) && shouldBlockByExt(s, '')) {
        const ext = extFromUrl(s) || 'desconhecido';
        BLOCK('window-open', hasPolicy ? `Download bloqueado: extensão .${ext} bloqueada pela política aplicada` : 'Download bloqueado: nenhuma política carregada');
        return null;
      }
      return _open.call(window, url, ...rest);
    }
  });

  // tecla Enter em <a>
  window.addEventListener('keydown', (e) => {
    if (!enabled) return;
    if (e.key !== 'Enter') return;
    const a = document.activeElement;
    if (!(a instanceof HTMLAnchorElement)) return;
    const href = a.getAttribute('href') || a.href || '';
    if (!isProtectedUrl(href)) return;
    
    // Ignora se for navegação normal (sem download attribute e sem extensão de arquivo)
    const dn = a.getAttribute('download') || a.download || '';
    if (!dn && !extFromUrl(href) && !looksLikeDownloadEndpoint(href)) return;
    
    if (shouldBlockByExt(href, dn)) {
      e.preventDefault(); e.stopImmediatePropagation(); e.stopPropagation();
      const ext = (dn && extFromFilename(dn)) || extFromUrl(href) || 'desconhecido';
      BLOCK('anchor-enter', hasPolicy ? `Download bloqueado: extensão .${ext} bloqueada pela política aplicada` : 'Download bloqueado: nenhuma política carregada');
    }
  }, true);

  console.debug('[SZ Guard] Content script ativo — toggle respected (enabled=', enabled, ').');
})();
