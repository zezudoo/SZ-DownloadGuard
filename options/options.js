const STORAGE = {
  enabled: 'enabled',
  configUrl: 'configUrl',
  policy: 'policy',
  policyFetchedAt: 'policyFetchedAt',
  policyLastError: 'policyLastError',
  policySource: 'policySource',
  policyValidationVersion: 'policyValidationVersion'
};

const DEFAULT_CONFIG_URL =
  'https://gist.githubusercontent.com/zezudoo/d335a55f69fea0abb9b4c8c15ac3d738/raw/6fb3ff240732d6a3b071c00b3d43b90662282850/allowlist_sz_guard.json';

const $ = (id) => document.getElementById(id);
const normalizeConfigUrl = (value) => {
  const url = String(value || '').trim();
  return url || DEFAULT_CONFIG_URL;
};

async function load() {
  const data = await chrome.storage.local.get([
    STORAGE.enabled,
    STORAGE.configUrl,
    STORAGE.policy,
    STORAGE.policyFetchedAt,
    STORAGE.policyLastError,
    STORAGE.policySource,
    STORAGE.policyValidationVersion
  ]);

  // Keep protection always on in this release.
  const enabledCheckbox = $('enabled');
  if (enabledCheckbox) {
    enabledCheckbox.checked = true;
    enabledCheckbox.disabled = true;
  }

  const configUrl = normalizeConfigUrl(data[STORAGE.configUrl]);
  $('configUrl').value = configUrl;
  if (configUrl !== data[STORAGE.configUrl]) {
    await chrome.storage.local.set({ [STORAGE.configUrl]: configUrl });
  }

  const p = data[STORAGE.policy];
  const ts = Number(data[STORAGE.policyFetchedAt] || 0);
  const ageSec = ts ? Math.max(0, Math.floor(Date.now() / 1000 - ts)) : null;
  const source = String(data[STORAGE.policySource] || configUrl);
  const lastError = String(data[STORAGE.policyLastError] || '').trim();
  const validationVersion = Number(data[STORAGE.policyValidationVersion] || 0);

  if (!p) {
    const outcome = lastError ? `erro (${lastError})` : 'sem sincronizacao bem-sucedida';
    $('info').textContent = `Policy cache: vazio - ultimo resultado=${outcome} - fonte=${source}`;
    return;
  }

  const ttlSeconds = Number(p.ttl_seconds);
  const stale = Number.isFinite(ttlSeconds) && ageSec !== null && ageSec >= ttlSeconds;
  const freshness = stale ? 'stale' : 'fresh';
  const outcome = lastError ? `erro (${lastError})` : 'ok';
  const validation = validationVersion || '?';

  $('info').textContent =
    `Policy cache: mode=${p.mode} - allowed.ext=${p?.allowed?.extensions?.length || 0} - allowed.mime=${p?.allowed?.mime_types?.length || 0} - ttl=${ttlSeconds || '?'}s - estado=${freshness} - idade=${ageSec ?? '?'}s - validacao=v${validation} - ultimo resultado=${outcome} - fonte=${source}`;
}

async function save() {
  const enabled = true;
  const configUrl = normalizeConfigUrl($('configUrl').value);

  await chrome.storage.local.set({
    [STORAGE.enabled]: enabled,
    [STORAGE.configUrl]: configUrl
  });

  const status = document.getElementById('status');
  status.textContent = 'Salvo.';
  status.className = 'ok';
  setTimeout(() => {
    status.textContent = '';
  }, 1500);
}

async function refresh() {
  const status = document.getElementById('status');
  status.textContent = 'Atualizando...';
  status.className = '';

  const res = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'refresh-policy' }, resolve);
  });

  if (res?.ok && !res?.lastError) {
    status.textContent = 'Atualizado OK';
    status.className = 'ok';
  } else if (res?.ok) {
    status.textContent = `Atualizacao com fallback de cache (${res.lastError})`;
    status.className = 'err';
  } else {
    const details = res?.error ? `: ${res.error}` : '';
    status.textContent = `Falha ao atualizar${details}`;
    status.className = 'err';
  }

  await load();
}

$('save').addEventListener('click', save);
$('refresh').addEventListener('click', refresh);
window.addEventListener('DOMContentLoaded', load);
