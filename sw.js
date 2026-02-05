// sw.js (type: module)

// ===================== Config =====================
const STORAGE = {
  enabled: 'enabled',
  configUrl: 'configUrl',
  policy: 'policy',
  policyFetchedAt: 'policyFetchedAt',
  policyLastError: 'policyLastError',
  policySource: 'policySource',
  policyValidationVersion: 'policyValidationVersion'
};

// Sem policy hardcoded. Apenas a URL padrão do seu Gist:
const DEFAULT_CONFIG_URL =
  'https://gist.githubusercontent.com/zezudoo/d335a55f69fea0abb9b4c8c15ac3d738/raw/6fb3ff240732d6a3b071c00b3d43b90662282850/allowlist_sz_guard.json';

const PROTECTED_HOST_RE = /^coopavelcoop\.sz\.chat$/i;

const SZ_TAB_TRACKING = {
  keyPrefix: 'szTabLastSeen:',
  ttlMs: 2 * 60 * 1000 // 2 min: evita "grudar" e afetar outras páginas
};

const POLICY_REFRESH_SCHEDULE = {
  alarmName: 'sz-download-guard-refresh-policy',
  periodMinutes: 60
};

const POLICY_VALIDATION_VERSION = 1;
const POLICY_MIN_TTL_SECONDS = 300;
const POLICY_MAX_TTL_SECONDS = 86400;

// ===================== Utils =====================
const isProtectedHost = (h) => PROTECTED_HOST_RE.test(String(h || ''));
const isProtectedUrl = (u) => {
  try {
    const parsed = new URL(u);
    return parsed.protocol === 'https:' && isProtectedHost(parsed.hostname);
  } catch {
    return false;
  }
};
const isBlobOrData = (u) => typeof u === 'string' && (u.startsWith('blob:') || u.startsWith('data:'));
const lower = (s) => (typeof s === 'string' ? s.toLowerCase() : '');

const normalizeExt = (value) => {
  const raw = lower(String(value || '').trim()).replace(/^\.+/, '');
  return raw;
};
const normalizeMime = (value) => {
  const raw = lower(String(value || '').trim());
  if (!raw) return '';
  return raw.split(';')[0].trim();
};
const normalizeExtList = (list) => {
  if (!Array.isArray(list)) return [];
  return list.map(normalizeExt).filter(Boolean);
};
const normalizeMimeList = (list) => {
  if (!Array.isArray(list)) return [];
  return list.map(normalizeMime).filter(Boolean);
};
const dedupe = (list) => Array.from(new Set(list));
const isValidIsoDateTime = (value) => {
  if (typeof value !== 'string' || !value.trim()) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
};

const GENERIC_MIME_TYPES = new Set([
  'application/octet-stream',
  'binary/octet-stream',
  'application/download',
  'application/x-download'
]);

const extFromFilename = (name) => {
  if (!name) return '';
  const clean = String(name).trim();
  if (!clean) return '';
  const last = clean.split(/[\\/]/).pop() || '';
  const dot = last.lastIndexOf('.');
  if (dot <= 0) return '';
  return normalizeExt(last.slice(dot + 1));
};
const extFromUrl = (url) => { try { return extFromFilename(new URL(url).pathname); } catch { return ''; } };

// ===================== Notificações =====================
// Cache para evitar notificações duplicadas (download ID → timestamp)
const notifiedDownloads = new Map();
const NOTIFY_COOLDOWN_MS = 3000; // 3 segundos de cooldown por download ID

async function notify(message, title = 'SZ Chat - Download Guard Coopavel') {
  try {
    await chrome.notifications.create('', {
      type: 'basic',
      iconUrl: 'icons/128.png',
      title,
      message,
      priority: 1
    });
  } catch {}
}

async function notifyOnce(downloadId, message, title = 'SZ Chat - Download Guard Coopavel') {
  const now = Date.now();
  const lastNotified = notifiedDownloads.get(downloadId);
  
  // Se já notificou recentemente este download, ignora
  if (lastNotified && (now - lastNotified) < NOTIFY_COOLDOWN_MS) {
    return;
  }
  
  notifiedDownloads.set(downloadId, now);
  await notify(message, title);
  
  // Limpa cache antigo (mantém apenas últimos 100 IDs)
  if (notifiedDownloads.size > 100) {
    const entries = Array.from(notifiedDownloads.entries());
    entries.sort((a, b) => a[1] - b[1]); // ordena por timestamp
    entries.slice(0, 50).forEach(([id]) => notifiedDownloads.delete(id)); // remove os 50 mais antigos
  }
}

async function cancelAndErase(id) {
  try { await chrome.downloads.cancel(id); } catch {}
  try { await chrome.downloads.erase({ id }); } catch {}
}

// ===================== Rastreamento de abas protegidas =====================
const szTabKey = (tabId) => `${SZ_TAB_TRACKING.keyPrefix}${tabId}`;

async function markProtectedTab(tabId) {
  if (!Number.isInteger(tabId) || tabId < 0) return;
  try {
    await chrome.storage.session.set({ [szTabKey(tabId)]: Date.now() });
  } catch {}
}

async function clearProtectedTab(tabId) {
  if (!Number.isInteger(tabId) || tabId < 0) return;
  try {
    await chrome.storage.session.remove(szTabKey(tabId));
  } catch {}
}

async function isRecentProtectedTab(tabId) {
  if (!Number.isInteger(tabId) || tabId < 0) return false;
  try {
    const key = szTabKey(tabId);
    const data = await chrome.storage.session.get(key);
    const lastSeen = Number(data?.[key] || 0);
    if (!lastSeen) return false;

    const now = Date.now();
    if (now - lastSeen > SZ_TAB_TRACKING.ttlMs) {
      await chrome.storage.session.remove(key);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// ===================== Policy remota =====================
async function getConfigUrl() {
  const { [STORAGE.configUrl]: url } = await chrome.storage.local.get(STORAGE.configUrl);
  const normalized = String(url || '').trim();
  return normalized || DEFAULT_CONFIG_URL;
}

async function getCachedPolicy() {
  const data = await chrome.storage.local.get([
    STORAGE.policy,
    STORAGE.policyFetchedAt,
    STORAGE.policyLastError,
    STORAGE.policySource,
    STORAGE.policyValidationVersion
  ]);
  return {
    policy: data[STORAGE.policy] || null,
    fetchedAt: data[STORAGE.policyFetchedAt] || 0,
    lastError: data[STORAGE.policyLastError] || '',
    source: data[STORAGE.policySource] || '',
    validationVersion: data[STORAGE.policyValidationVersion] || 0
  };
}

function normalizePolicy(policy) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    throw new Error('policy must be a JSON object');
  }
  if (Number(policy.schema_version) !== 1) {
    throw new Error('schema_version must be 1');
  }
  if (policy.mode !== 'allow') {
    throw new Error('mode must be \"allow\"');
  }
  if (Object.prototype.hasOwnProperty.call(policy, 'default_action') &&
      lower(policy.default_action) !== 'block') {
    throw new Error('default_action must be \"block\" when provided');
  }

  const ttlSeconds = Number(policy.ttl_seconds);
  if (!Number.isInteger(ttlSeconds) ||
      ttlSeconds < POLICY_MIN_TTL_SECONDS ||
      ttlSeconds > POLICY_MAX_TTL_SECONDS) {
    throw new Error(`ttl_seconds must be an integer between ${POLICY_MIN_TTL_SECONDS} and ${POLICY_MAX_TTL_SECONDS}`);
  }

  if (!policy.allowed ||
      typeof policy.allowed !== 'object' ||
      !Array.isArray(policy.allowed.extensions) ||
      !Array.isArray(policy.allowed.mime_types)) {
    throw new Error('allowed.extensions and allowed.mime_types must be arrays');
  }

  if (Object.prototype.hasOwnProperty.call(policy, 'updated_at') &&
      !isValidIsoDateTime(policy.updated_at)) {
    throw new Error('updated_at must be a valid ISO datetime');
  }

  const extensions = dedupe(normalizeExtList(policy.allowed.extensions));
  const mimeTypes = dedupe(normalizeMimeList(policy.allowed.mime_types));

  return {
    ...policy,
    schema_version: 1,
    mode: 'allow',
    default_action: 'block',
    ttl_seconds: ttlSeconds,
    allowed: {
      ...policy.allowed,
      extensions,
      mime_types: mimeTypes
    }
  };
}

async function savePolicy(policy, sourceUrl) {
  await chrome.storage.local.set({
    [STORAGE.policy]: policy,
    [STORAGE.policyFetchedAt]: Math.floor(Date.now() / 1000),
    [STORAGE.policyLastError]: '',
    [STORAGE.policySource]: sourceUrl,
    [STORAGE.policyValidationVersion]: POLICY_VALIDATION_VERSION
  });
}

async function savePolicyFetchError(sourceUrl, error) {
  const message = String(error?.message || error || 'unknown error');
  await chrome.storage.local.set({
    [STORAGE.policyLastError]: message,
    [STORAGE.policySource]: sourceUrl,
    [STORAGE.policyValidationVersion]: POLICY_VALIDATION_VERSION
  });
}

async function refreshPolicy(nonBlocking = true) {
  const url = await getConfigUrl();
  const doFetch = async () => {
    try {
      const res = await fetch(url, { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const normalized = normalizePolicy(json);
      await savePolicy(normalized, url);
    } catch (e) {
      await savePolicyFetchError(url, e);
      console.debug('[SZ Guard] refreshPolicy falhou:', e?.message || e);
    }
  };
  if (nonBlocking) {
    void doFetch();
  } else {
    await doFetch();
  }
}

async function getPolicyForDecision() {
  const { policy, fetchedAt } = await getCachedPolicy();
  if (policy) {
    const now = Math.floor(Date.now() / 1000);
    const ttlSeconds = Number(policy.ttl_seconds);
    if (Number.isFinite(ttlSeconds) && now - (fetchedAt || 0) >= ttlSeconds) {
      void refreshPolicy(true); // atualiza em background
    }
    return policy;
  }
  // sem policy no cache → tenta atualizar em background e retorna null
  void refreshPolicy(true);
  return null;
}

// ===================== Toggle =====================
async function isEnabled() {
  const { [STORAGE.enabled]: enabled } = await chrome.storage.local.get(STORAGE.enabled);
  return enabled !== false; // default true
}

// ===================== Origem protegida =====================
async function isFromProtectedDomain(item) {
  if (item?.byExtensionId === chrome.runtime.id) return false;

  const url = item?.finalUrl || item?.url || '';
  const ref = item?.referrer || '';
  if (isProtectedUrl(url)) return true;
  if (isProtectedUrl(ref)) return true;

  // blob/data: muitos sites usam isso; só trate como protegido se houver referrer compatível
  // ou se o download veio de uma aba que foi vista recentemente no host alvo.
  if (isBlobOrData(url)) {
    if (ref) return isProtectedUrl(ref);
    return await isRecentProtectedTab(item?.tabId);
  }
  return false;
}

// ===================== Decisão allow/block =====================
// Sem policy → BLOCK ALL (seguro por padrão).
function decideAllow(policy, { url, filename, mime }) {
  const ext = normalizeExt(extFromFilename(filename || '') || extFromUrl(url || ''));
  const mimeL = normalizeMime(mime || '');

  if (!policy) {
    return { allow: false, reason: 'no-policy', ext, mime: mimeL };
  }

  const allowedExts = new Set(normalizeExtList(policy?.allowed?.extensions));
  const allowedMimes = new Set(normalizeMimeList(policy?.allowed?.mime_types));
  const hasUsefulMime = !!mimeL && !GENERIC_MIME_TYPES.has(mimeL);

  if (hasUsefulMime) {
    if (!allowedMimes.has(mimeL)) return { allow: false, reason: 'mime-not-allowed', ext, mime: mimeL };
    if (ext && !allowedExts.has(ext)) return { allow: false, reason: 'ext-not-allowed', ext, mime: mimeL };
    return { allow: true, ext, mime: mimeL };
  }

  if (!ext) return { allow: false, reason: 'ext-missing', ext, mime: mimeL };
  if (!allowedExts.has(ext)) return { allow: false, reason: 'ext-not-allowed', ext, mime: mimeL };
  return { allow: true, ext, mime: mimeL };
}

function buildBlockMessage(decision) {
  switch (decision.reason) {
    case 'no-policy':
      return 'Download bloqueado: nenhuma política carregada';
    case 'mime-not-allowed':
      return `Download bloqueado: MIME ${decision.mime || 'desconhecido'} bloqueado pela política aplicada`;
    case 'ext-not-allowed':
      return `Download bloqueado: extensão .${decision.ext || 'desconhecida'} bloqueada pela política aplicada`;
    case 'ext-missing':
      return 'Download bloqueado: extensão ausente ou inválida';
    default:
      return 'Download bloqueado pela política aplicada';
  }
}

// ===================== Hooks de downloads =====================
const handledDownloads = new Map();
const inFlightDownloads = new Set();
const pendingFallbacks = new Map();
const DOWNLOAD_HANDLE_CLEANUP_MS = 5000;
const DOWNLOAD_FALLBACK_DELAY_MS = 800;

function scheduleHandledCleanup(id) {
  setTimeout(() => handledDownloads.delete(id), DOWNLOAD_HANDLE_CLEANUP_MS);
}

async function handleDownload(item, source) {
  if (!item || !Number.isInteger(item.id)) return false;
  if (handledDownloads.has(item.id) || inFlightDownloads.has(item.id)) return true;

  inFlightDownloads.add(item.id);
  let handled = false;
  try {
    if (!(await isEnabled())) return false;
    if (!(await isFromProtectedDomain(item))) return false;

    handledDownloads.set(item.id, { source, at: Date.now() });
    handled = true;

    const policy = await getPolicyForDecision();
    const decision = decideAllow(policy, {
      url: item.finalUrl || item.url || '',
      filename: item.filename || '',
      mime: item.mime || ''
    });

    if (!decision.allow) {
      await cancelAndErase(item.id);
      await notifyOnce(item.id, buildBlockMessage(decision));
    }
    return true;
  } catch (e) {
    console.debug('[SZ Guard] erro handleDownload:', e?.message || e);
    return false;
  } finally {
    inFlightDownloads.delete(item.id);
    if (handled) scheduleHandledCleanup(item.id);
  }
}

chrome.downloads.onDeterminingFilename.addListener(async (item /*, suggest */) => {
  const handled = await handleDownload(item, 'onDeterminingFilename');
  if (handled) {
    const timer = pendingFallbacks.get(item.id);
    if (timer) {
      clearTimeout(timer);
      pendingFallbacks.delete(item.id);
    }
  }
});

// Fallback: tenta processar caso o onDeterminingFilename não rode/tenha falhado.
chrome.downloads.onCreated.addListener((item) => {
  if (!item || !Number.isInteger(item.id)) return;
  if (pendingFallbacks.has(item.id)) return;
  if (handledDownloads.has(item.id) || inFlightDownloads.has(item.id)) return;

  const timer = setTimeout(() => {
    pendingFallbacks.delete(item.id);
    void handleDownload(item, 'onCreated-fallback');
  }, DOWNLOAD_FALLBACK_DELAY_MS);
  pendingFallbacks.set(item.id, timer);
});

// Mensagens (options + toasts do content script)
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || !msg.type) return;

  if (msg.type === 'sz-tab-ping') {
    const tabId = _sender?.tab?.id;
    const url = msg?.url || _sender?.url || _sender?.tab?.url || '';
    if (isProtectedUrl(url)) markProtectedTab(tabId);
    return;
  }

  if (msg.type === 'sz-tab-clear') {
    const tabId = _sender?.tab?.id;
    clearProtectedTab(tabId);
    return;
  }

  if (msg.type === 'refresh-policy') {
    (async () => {
      try {
        await refreshPolicy(false);
        const cached = await getCachedPolicy();
        const ttlSeconds = Number(cached.policy?.ttl_seconds);
        const ageSeconds = cached.fetchedAt
          ? Math.max(0, Math.floor(Date.now() / 1000 - cached.fetchedAt))
          : null;
        const stale = !!cached.policy &&
          Number.isFinite(ttlSeconds) &&
          ageSeconds !== null &&
          ageSeconds >= ttlSeconds;
        sendResponse({
          ok: !!cached.policy,
          fetchedAt: cached.fetchedAt,
          stale,
          lastError: cached.lastError,
          source: cached.source,
          validationVersion: cached.validationVersion,
          summary: cached.policy ? {
            ext: cached.policy?.allowed?.extensions?.length || 0,
            mime: cached.policy?.allowed?.mime_types?.length || 0
          } : null
        });
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
    })();
    return true;
  }

  if (msg.type === 'sz-blocked-notify') {
    notify(msg.details || 'Download bloqueado pela política aplicada');
  }
});

function ensurePolicyRefreshAlarm() {
  try {
    chrome.alarms.create(POLICY_REFRESH_SCHEDULE.alarmName, {
      periodInMinutes: POLICY_REFRESH_SCHEDULE.periodMinutes
    });
  } catch {}
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm?.name !== POLICY_REFRESH_SCHEDULE.alarmName) return;
  return refreshPolicy(false);
});

// Bootstrap
chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get([STORAGE.enabled, STORAGE.configUrl]);
  if (!Object.prototype.hasOwnProperty.call(data, STORAGE.enabled)) {
    await chrome.storage.local.set({ [STORAGE.enabled]: true });
  }
  if (!data[STORAGE.configUrl]) {
    await chrome.storage.local.set({ [STORAGE.configUrl]: DEFAULT_CONFIG_URL });
  }

  ensurePolicyRefreshAlarm();

  // busca/aplica a policy já na instalação/atualização
  await refreshPolicy(false);
});

chrome.runtime.onStartup.addListener(() => {
  ensurePolicyRefreshAlarm();
  void refreshPolicy(true);
});
