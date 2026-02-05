/***********************
 * GIST SYNC (Nudos)
 * - Guarda/Carga nudos en un Gist: nudos.json
 * - Requiere GitHub Token (scope: gist) guardado en localStorage
 ***********************/
const GIST_KEYS = {
  token: 'nudos_gist_token_v1',
  gistId: 'nudos_gist_id_v1',
  filename: 'nudos.json'
};

function getGistToken() {
  return (localStorage.getItem(GIST_KEYS.token) || '').trim();
}
function setGistToken(t) {
  localStorage.setItem(GIST_KEYS.token, (t || '').trim());
}
function getGistId() {
  return (localStorage.getItem(GIST_KEYS.gistId) || '').trim();
}
function setGistId(id) {
  localStorage.setItem(GIST_KEYS.gistId, (id || '').trim());
}

/** Toast minimalista **/
function ensureToastHost() {
  if (document.getElementById('toast-host')) return;
  const host = document.createElement('div');
  host.id = 'toast-host';
  host.style.cssText = `
    position: fixed; right: 16px; bottom: 16px; z-index: 9999;
    display: grid; gap: 8px; max-width: min(360px, calc(100vw - 32px));
  `;
  document.body.appendChild(host);
}
function toast(msg, type) {
  ensureToastHost();
  const el = document.createElement('div');
  const ok = type !== 'error';
  el.style.cssText = `
    padding: 10px 12px; border-radius: 12px;
    background: ${ok ? '#111' : '#2b0f14'};
    color: #fff; box-shadow: 0 10px 30px rgba(0,0,0,.18);
    font-size: 13px; line-height: 1.2;
    border: 1px solid ${ok ? 'rgba(255,255,255,.12)' : 'rgba(255,80,80,.35)'};
  `;
  el.textContent = msg;
  document.getElementById('toast-host').appendChild(el);
  setTimeout(() => { try { el.remove(); } catch (_) {} }, 2600);
}

/** Helpers API GitHub **/
async function ghFetch(url, opts) {
  const token = getGistToken();
  const headers = Object.assign(
    {
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json'
    },
    (opts && opts.headers) || {}
  );

  // Authorization solo si hay token (para GET público no haría falta)
  if (token) headers['Authorization'] = `token ${token}`;

  const res = await fetch(url, Object.assign({}, opts || {}, { headers }));
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }

  if (!res.ok) {
    const msg = (data && data.message) ? data.message : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

async function gistGet(gistId) {
  return ghFetch(`https://api.github.com/gists/${encodeURIComponent(gistId)}`, { method: 'GET' });
}

async function gistPatch(gistId, payload) {
  return ghFetch(`https://api.github.com/gists/${encodeURIComponent(gistId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

/** Formato de storage en la nube **/
function buildCloudPayloadFromLocal() {
  // ADAPTAR si tu app guarda más cosas además de knots
  const knots = (typeof getKnots === 'function') ? getKnots() : [];
  return {
    version: 1,
    updatedAt: Date.now(),
    knots: Array.isArray(knots) ? knots : []
  };
}

function applyCloudPayloadToLocal(payload) {
  if (!payload || !Array.isArray(payload.knots)) throw new Error('Payload inválido (knots).');

  // ADAPTAR: tu app probablemente persiste con setKnots / saveKnots / etc.
  if (typeof saveKnots === 'function') {
    saveKnots(payload.knots);
  } else {
    // fallback genérico si tu app usa update/create en storage propio:
    localStorage.setItem('nudos_knots_v1', JSON.stringify(payload.knots));
  }
}

/** Lee el nudos.json desde el gist */
async function loadFromGist() {
  const gistId = getGistId();
  if (!gistId) throw new Error('Falta Gist ID.');

  const g = await gistGet(gistId);

  const f = g && g.files && g.files[GIST_KEYS.filename];
  if (!f) throw new Error(`No existe ${GIST_KEYS.filename} en ese Gist.`);

  // Si GitHub no incluye "content" (a veces por tamaño), hay raw_url
  let content = f.content;
  if (!content && f.raw_url) {
    const raw = await fetch(f.raw_url);
    content = await raw.text();
  }

  const payload = JSON.parse(content || '{}');
  return payload;
}

/** Guarda el payload local en el gist */
async function saveToGist() {
  const gistId = getGistId();
  if (!gistId) throw new Error('Falta Gist ID.');
  if (!getGistToken()) throw new Error('Falta Token (scope: gist).');

  const localPayload = buildCloudPayloadFromLocal();

  // (0,01%) Mini-protección de conflicto:
  // si remoto tiene updatedAt mayor, NO pisamos sin avisar
  let remotePayload = null;
  try {
    remotePayload = await loadFromGist();
  } catch (_) {
    // si no se puede leer, igual intentamos guardar
  }

  if (remotePayload && remotePayload.updatedAt && remotePayload.updatedAt > localPayload.updatedAt) {
    throw new Error('Conflicto: lo remoto es más nuevo. Cargá primero desde Gist.');
  }

  const patch = {
    files: {
      [GIST_KEYS.filename]: {
        content: JSON.stringify(localPayload, null, 2)
      }
    }
  };

  await gistPatch(gistId, patch);
  return localPayload;
}

/** UI: Config básica (token + gistId) */
function showGistConfigModal() {
  const currentId = getGistId();
  const hasToken = !!getGistToken();

  const html = `
    <h3>Sync con Gist</h3>
    <div class="notice">
      Esto permite usar la app desde varios dispositivos.
      <div class="hint">Recomendado: Gist “Secret”.</div>
    </div>

    <div class="field">
      <label>Gist ID</label>
      <input id="gist-id" placeholder="ej: abc123..." value="${escapeHTML(currentId)}" />
      <div class="hint">Es el ID que aparece en la URL del Gist.</div>
    </div>

    <div class="field">
      <label>Token GitHub (scope: gist)</label>
      <input id="gist-token" placeholder="ghp_..." value="${hasToken ? '••••••••••' : ''}" />
      <div class="hint">Tip: guardalo solo en tus dispositivos de confianza.</div>
    </div>

    <div class="row">
      <button class="btn btn-primary" id="gist-save">Guardar</button>
      <button class="btn" id="gist-close">Cerrar</button>
    </div>
  `;

  if (typeof showModal === 'function') {
    showModal(html, { showClose: false });
    document.getElementById('gist-close').onclick = () => hideModal();

    document.getElementById('gist-save').onclick = () => {
      const id = (document.getElementById('gist-id').value || '').trim();
      const tokenInput = (document.getElementById('gist-token').value || '').trim();

      if (id) setGistId(id);

      // Si el usuario deja '••••' no lo pisamos
      if (tokenInput && tokenInput !== '••••••••••') setGistToken(tokenInput);

      hideModal();
      toast('Config de Gist guardada ✅');
    };
  } else {
    // si no tenés modal, fallback feo:
    const id = prompt('Gist ID:', currentId || '');
    if (id !== null) setGistId(id.trim());
    const tok = prompt('Token GitHub (scope gist):', '');
    if (tok) setGistToken(tok.trim());
    toast('Config guardada ✅');
  }
}

/** Botones para reemplazar Export/Import */
async function handleCloudSave() {
  try {
    await saveToGist();
    toast('Guardado en Gist ✅');
  } catch (e) {
    toast('Error guardando: ' + (e.message || e), 'error');
  }
}

async function handleCloudLoad() {
  try {
    const payload = await loadFromGist();
    applyCloudPayloadToLocal(payload);

    // refrescar UI
    if (typeof renderToday === 'function') renderToday();
    if (typeof renderInsights === 'function') renderInsights();

    toast('Cargado desde Gist ✅');
  } catch (e) {
    toast('Error cargando: ' + (e.message || e), 'error');
  }
}
