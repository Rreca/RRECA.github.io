/*************************************************************
 * ui.js – Nudos (Offline) – COMPLETO
 * + Archivados (colapsable + agrupado + restore + delete + métricas)
 * + Split archiva el original (SPLIT) y permite contexto por micro-paso (AUTO/heredar por defecto)
 * + Edición manual de contexto (override) desde Detalle y desde Editar ALGÚN DÍA
 *************************************************************/

/***********************
 * Regla de filtro (estricta):
 * - ALL = no filtra
 * - ANY = solo los sin contexto
 * - HOME/STREET/WORK = solo los de ese contexto
 ***********************/
function matchesActiveContext(k, ctx) {
  if (ctx === CONTEXTS.ALL) return true;
  if (ctx === CONTEXTS.ANY) return (k.context === CONTEXTS.ANY || !k.context);
  return (k.context === ctx);
}

let backlogSortMode = 'friction'; // friction | impact | recent

/***********************
 * UI STATE (toggle sliders mini)
 ***********************/
const UI_KEYS = {
  quickEditHidden: 'nudos_ui_quick_edit_hidden_v1',
  archivedCollapsed: 'nudos_ui_archived_collapsed_v1'
};

function isQuickEditHidden() {
  return localStorage.getItem(UI_KEYS.quickEditHidden) === '1';
}
function setQuickEditHidden(hidden) {
  localStorage.setItem(UI_KEYS.quickEditHidden, hidden ? '1' : '0');
  document.body.classList.toggle('hide-quick', hidden);
  const btn = document.getElementById('btn-quick-toggle');
  if (btn) btn.textContent = hidden ? 'Edición rápida: OFF' : 'Edición rápida: ON';
}

function isArchivedCollapsed() {
  const v = localStorage.getItem(UI_KEYS.archivedCollapsed);
  // default: colapsado
  return (v === null) ? true : (v === '1');
}
function setArchivedCollapsed(collapsed) {
  localStorage.setItem(UI_KEYS.archivedCollapsed, collapsed ? '1' : '0');
}

/***********************
 * Heurística de contexto (auto-detección)
 ***********************/
function suggestContextForNewKnot(title, nextStep) {
  const t = `${title || ''} ${nextStep || ''}`.toLowerCase();

  // calle
  if (/\b(ferreter[ií]a|panader[ií]a|super|kiosco|comprar|ir a|salir|llevar|retirar|pasar por|env[ií]o|correo|mercado libre|pagar en|banco|cajero)\b/.test(t)) {
    return CONTEXT.STREET;
  }

  // trabajo
  if (/\b(reuni[oó]n|meeting|jira|ticket|deploy|merge|pull request|pr\b|commit|release|prod|stag(e)?|qa|cliente|slack|correo|email|documentaci[oó]n|spec)\b/.test(t)) {
    return CONTEXT.WORK;
  }

  // casa
  if (/\b(limpiar|lavar|cocinar|pintar|arreglar|reparar|mueble|pared|patio|casa|ba[nñ]o|cocina)\b/.test(t)) {
    return CONTEXT.HOME;
  }

  return CONTEXT.ANY;
}

/***********************
 * CONTEXTOS (FIX ALL/ANY/WORK)
 * - Contexto de NUDO: ANY | HOME | STREET | WORK
 * - Contexto de FILTRO (NAV): ALL | HOME | STREET | WORK
 ***********************/
const CONTEXT = Object.freeze({
  ANY: 'ANY',
  HOME: 'HOME',
  STREET: 'STREET',
  WORK: 'WORK'
});
const CONTEXTS = Object.freeze({
  ANY: 'ANY',
  HOME: 'HOME',
  STREET: 'STREET',
  WORK: 'WORK',
  ALL: 'ALL' // solo para nav (por compatibilidad con matchesActiveContext)
});
const CONTEXT_FILTER = Object.freeze({
  ALL: 'ALL',
  HOME: 'HOME',
  STREET: 'STREET',
  WORK: 'WORK'
});

const CONTEXT_KEYS = {
  navFilter: 'nudos_nav_context_filter_v1',
  migrated: 'nudos_context_migrated_v1'
};

function normalizeContext(raw, isFilter) {
  const v = String(raw || '').trim().toUpperCase();

  if (!v) return isFilter ? CONTEXT_FILTER.ALL : CONTEXT.ANY;

  if (v === 'CASA' || v === 'HOME' || v === 'HOGAR') return CONTEXT.HOME;
  if (v === 'CALLE' || v === 'STREET' || v === 'OUT' || v === 'OUTSIDE') return CONTEXT.STREET;
  if (v === 'TRABAJO' || v === 'WORK' || v === 'OFICINA' || v === 'OFFICE') return CONTEXT.WORK;

  if (v === 'ANY' || v === 'CUALQUIERA') return CONTEXT.ANY;

  if (v === 'ALL' || v === 'TODOS') return isFilter ? CONTEXT_FILTER.ALL : CONTEXT.ANY;

  return isFilter ? CONTEXT_FILTER.ALL : CONTEXT.ANY;
}

function getActiveContextFilter() {
  if (window.__activeContextFilter) return normalizeContext(window.__activeContextFilter, true);
  return normalizeContext(localStorage.getItem(CONTEXT_KEYS.navFilter), true);
}

function setActiveContextFilter(filter) {
  const f = normalizeContext(filter, true);
  localStorage.setItem(CONTEXT_KEYS.navFilter, f);
  window.__activeContextFilter = f;
  renderToday();
  return f;
}

function getKnotContext(k) {
  const raw = (k && (k.context || k.ctx || k.place || k.where)) || CONTEXT.ANY;
  return normalizeContext(raw, false);
}

function isKnotVisibleInFilter(k, filter) {
  const f = normalizeContext(filter, true);
  if (f === CONTEXT_FILTER.ALL) return true;

  const kc = getKnotContext(k);

  // ANY aparece en cualquier filtro (lo podés hacer en cualquier contexto)
  if (kc === CONTEXT.ANY) return true;

  return kc === f;
}

/**
 * MIGRACIÓN: convierte contextos viejos y elimina "ALL" como contexto de nudo.
 */
function migrateKnotContextsOnce() {
  if (localStorage.getItem(CONTEXT_KEYS.migrated) === '1') return;

  const knots = getKnots();
  let changed = 0;

  knots.forEach(k => {
    const oldRaw = (k.context || k.ctx || k.place || k.where);
    const newCtx = getKnotContext(k);

    if ((oldRaw || '') && normalizeContext(oldRaw, false) !== newCtx) {
      updateKnot({ id: k.id, context: newCtx });
      changed++;
    } else if (!oldRaw) {
      updateKnot({ id: k.id, context: CONTEXT.ANY });
      changed++;
    }
  });

  localStorage.setItem(CONTEXT_KEYS.migrated, '1');
  if (changed) logEvent('CONTEXT_MIGRATED', { changed });
}

function contextLabel(ctx) {
  const c = normalizeContext(ctx, false);
  if (c === CONTEXT.HOME) return 'Casa';
  if (c === CONTEXT.STREET) return 'Calle';
  if (c === CONTEXT.WORK) return 'Trabajo';
  return 'ANY';
}

function contextBadge(ctx) {
  const c = normalizeContext(ctx, false);
  const cls =
    c === CONTEXT.HOME ? 'ctx-home' :
    c === CONTEXT.STREET ? 'ctx-street' :
    c === CONTEXT.WORK ? 'ctx-work' :
    'ctx-any';

  const icon =
    c === CONTEXT.HOME ? '🏠' :
    c === CONTEXT.STREET ? '🚶' :
    c === CONTEXT.WORK ? '💼' : '🌐';

  return `<span class="badge ${cls}">${icon} ${escapeHTML(contextLabel(c))}</span>`;
}

/***********************
 * META MÍNIMA DIARIA
 ***********************/
const GOAL_KEYS = {
  dailyMinDone: 'nudos_goal_daily_min_done_v1'
};

function getDailyGoal() {
  const v = parseInt(localStorage.getItem(GOAL_KEYS.dailyMinDone), 10);
  return Number.isFinite(v) && v >= 1 && v <= 20 ? v : 1;
}
function setDailyGoal(n) {
  const v = Math.max(1, Math.min(20, parseInt(n, 10) || 1));
  localStorage.setItem(GOAL_KEYS.dailyMinDone, String(v));
  return v;
}

function startOfTodayTs() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function countDoneToday() {
  migrateKnotContextsOnce();
  const knots = getKnots();
  const start = startOfTodayTs();
  const end = start + 24 * 60 * 60 * 1000;

  let c = 0;
  knots.forEach(k => {
    if (k.status !== 'DONE') return;
    const ts = k.doneAt || k.updatedAt || k.lastTouchedAt || k.createdAt || 0;
    if (ts >= start && ts < end) c++;
  });
  return c;
}

function updateGoalChip() {
  const chip = document.getElementById('goal-chip');
  if (!chip) return;

  const goal = getDailyGoal();
  const done = countDoneToday();

  chip.textContent = `Meta: ${done}/${goal} hecho(s) hoy`;
  chip.className = 'badge ' + (done >= goal ? 'done' : 'doing');

  const btn = document.getElementById('btn-close-goal');
  if (btn) btn.style.display = (done >= goal) ? 'none' : 'inline-block';
}

function renderDailyGoalPanel() {
  const goal = getDailyGoal();
  const doneToday = countDoneToday();
  const missing = Math.max(0, goal - doneToday);

  const cls = missing > 0 ? 'goal-warn' : 'goal-ok';
  const icon = missing > 0 ? '🟡' : '🟢';
  const msg = missing > 0
    ? `Te faltan <b>${missing}</b> HECHO(s) hoy para tu mínimo. Hacé 1 micro-cosa de 5 min.`
    : `Mínimo cumplido. No negocies la cadena.`;

  return `
    <div class="panel">
      <h3>Meta mínima diaria</h3>

      <div class="notice ${missing > 0 ? '' : ''}">
        ${icon} Hoy: <b>${doneToday}</b> hecho(s). Meta: <b>${goal}</b>.
        <div class="hint">${msg}</div>
      </div>

      <div class="goal-row">
        <span class="goal-pill ${cls}">
          Meta:
          <input id="daily-goal-input" type="number" min="1" max="20" value="${goal}" />
          <span class="hint">(1–20)</span>
        </span>

        <button id="daily-goal-save" class="btn small btn-primary">Guardar meta</button>
        <button id="daily-goal-one" class="btn small">Poner en 1</button>
      </div>

      <div class="hint" style="margin-top:8px;">
        Regla 0,01%: la meta mínima no se discute. Aunque sea “una pavada hecha”.
      </div>
    </div>
  `;
}

/***********************
 * Diccionarios
 ***********************/
const STATUS_ES = {
  BLOCKED: 'BLOQUEADO',
  UNLOCKABLE: 'DESBLOQUEABLE',
  DOING: 'EN PROGRESO',
  DONE: 'HECHO',
  SOMEDAY: 'ALGÚN DÍA',
  ARCHIVED: 'ARCHIVADO'
};

const REASON_ES = {
  NO_START: 'No sé por dónde empezar',
  LAZINESS: 'Pereza',
  FEAR: 'Miedo',
  EXTERNAL: 'Depende de un externo',
  NOT_TODAY: 'No hoy'
};

// Motivos de archivado (cortitos)
const ARCHIVE_REASON_ES = {
  SPLIT: 'Se dividió (split)',
  DONE_MERGE: 'Se “fusionó” a hecho',
  MANUAL: 'Archivado manual',
  CLEANUP: 'Limpieza/orden',
  OTHER: 'Otro'
};

function statusToEs(code) { return STATUS_ES[code] || String(code || ''); }
function reasonToEs(code) { return REASON_ES[code] || String(code || ''); }
function archiveReasonToEs(code) { return ARCHIVE_REASON_ES[code] || String(code || ''); }

/***********************
 * Métricas: Fricción/Impacto/Score
 ***********************/
function getFriction(k) {
  const v = (typeof k.weight === 'number') ? k.weight : parseInt(k.weight, 10);
  return Number.isFinite(v) ? v : 3;
}
function getImpact(k) {
  const v = (typeof k.impact === 'number') ? k.impact : parseInt(k.impact, 10);
  return Number.isFinite(v) ? v : 3;
}
function priorityScore(k) {
  return getImpact(k) - getFriction(k);
}

/***********************
 * Badges
 ***********************/
function statusBadge(statusCode) {
  const mapClass = {
    UNLOCKABLE: 'unlockable',
    DOING: 'doing',
    BLOCKED: 'blocked',
    SOMEDAY: 'someday',
    DONE: 'done',
    ARCHIVED: 'archived'
  };
  const cls = mapClass[statusCode] || '';
  return '<span class="badge ' + cls + '">' + escapeHTML(statusToEs(statusCode)) + '</span>';
}

// OJO: en tu archivo original tenías 2 contextBadge.
// Dejo SOLO esta (la de arriba ya existía en versión “ctx-*” y es más clara).
// Si tu CSS esperaba .home/.work/.any, ajustá clases o CSS.
function scoreBadge(score) {
  if (score >= 3) return '<span class="badge hot">HACÉLO YA</span>';
  if (score <= -2) return '<span class="badge split">DIVIDIR</span>';
  return '';
}

/***********************
 * Modal
 ***********************/
let __isModalOpen = false;

function showModal(contentHtml, opts) {
  const overlay = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');
  if (!overlay || !content) return;

  __isModalOpen = true;

  const chip = document.getElementById('timer-chip');
  if (chip) chip.style.display = 'none';

  const options = opts || {};
  const closeText = options.closeText || 'Cerrar';
  const showClose = options.showClose !== false;

  content.innerHTML = '<div>' + contentHtml + '</div>';

  if (showClose) {
    const row = document.createElement('div');
    row.className = 'row';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn';
    closeBtn.textContent = closeText;
    closeBtn.addEventListener('click', () => {
      hideModal();
      if (typeof options.onClose === 'function') options.onClose();
    });
    row.appendChild(closeBtn);
    content.appendChild(document.createElement('hr'));
    content.appendChild(row);
  }

  overlay.style.display = 'flex';
}

function hideModal() {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.style.display = 'none';
  __isModalOpen = false;
  syncTimerChip();
}

/***********************
 * Timer 5 min + chip
 ***********************/
let __timerState = { running: false, knotId: null, endAt: 0, intervalId: null };

function syncTimerChip() {
  const chip = document.getElementById('timer-chip');
  if (!chip) return;

  if (__isModalOpen) {
    chip.style.display = 'none';
    return;
  }

  if (!__timerState.running) {
    chip.style.display = 'none';
    chip.onclick = null;
    return;
  }

  const left = Math.max(0, __timerState.endAt - Date.now());
  const totalSeconds = Math.ceil(left / 1000);

  const m = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');

  const knot = getKnotById(__timerState.knotId);
  const title = knot ? knot.title : 'Nudo';
  const step = (knot && knot.nextStep) ? knot.nextStep : null;

  chip.style.display = 'inline-block';
  chip.textContent = `⏱ ${m}:${s} · ${title}${step ? ' · ' + step : ''}`;

  if (totalSeconds <= 0) {
    stopFiveMin('TIMER_FINISHED');
  }
}

function startFiveMin(knotId) {
  clearInterval(__timerState.intervalId);
  __timerState.running = true;
  __timerState.knotId = knotId;
  __timerState.endAt = Date.now() + 5 * 60 * 1000;

  __timerState.intervalId = setInterval(syncTimerChip, 300);
  syncTimerChip();
  logEvent('TIMER_5MIN_START', { knotId: knotId });
}

function stopFiveMin(reason) {
  try { clearInterval(__timerState.intervalId); } catch (_) { }

  __timerState.running = false;
  __timerState.knotId = null;
  __timerState.endAt = 0;
  __timerState.intervalId = null;

  syncTimerChip();
  logEvent('TIMER_5MIN_STOP', { reason: reason || 'STOP' });
}

/***********************
 * Helpers de botones
 ***********************/
function makeBtn(text, cls, onClick) {
  const b = document.createElement('button');
  b.className = ('btn ' + (cls || '')).trim();
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

/***********************
 * Context override helpers
 ***********************/
function getContextSource(k) {
  const v = String(k?.contextSource || '').toUpperCase();
  return (v === 'MANUAL') ? 'MANUAL' : 'AUTO';
}

function setKnotContextManual(id, ctx) {
  updateKnot({ id, context: normalizeContext(ctx, false), contextSource: 'MANUAL', updatedAt: Date.now() });
}

function setKnotContextAuto(id, ctx) {
  updateKnot({ id, context: normalizeContext(ctx, false), contextSource: 'AUTO', updatedAt: Date.now() });
}

/***********************
 * Archivado helpers
 ***********************/
function archiveKnot(id, reason) {
  const k = getKnotById(id);
  if (!k) return;
  updateKnot({
    id,
    status: 'ARCHIVED',
    archiveReason: reason || 'OTHER',
    archivedAt: Date.now(),
    updatedAt: Date.now(),
    lastTouchedAt: Date.now()
  });
  logEvent('KNOT_ARCHIVED', { id, reason: reason || 'OTHER' });
}

function restoreArchivedToSomeday(id) {
  const k = getKnotById(id);
  if (!k) return;
  updateKnot({
    id,
    status: 'SOMEDAY',
    archiveReason: null,
    archivedAt: null,
    updatedAt: Date.now(),
    lastTouchedAt: Date.now()
  });
  logEvent('KNOT_RESTORED', { id, to: 'SOMEDAY' });
}

/***********************
 * Tarjeta
 ***********************/
function createKnotCard(knot) {
  const friction = getFriction(knot);
  const impact = getImpact(knot);
  const score = priorityScore(knot);

  const card = document.createElement('div');
  card.className = 'card';

  const ctx = getKnotContext(knot);
  const ctxSrc = getContextSource(knot);

  const ctxLine = `
    <div class="hint" style="margin:4px 0;">
      Contexto: ${contextBadge(ctx)}
      <span class="hint" style="margin-left:6px;">(${ctxSrc === 'MANUAL' ? 'manual' : 'auto'})</span>
    </div>
  `;

  const archivedLine = (knot.status === 'ARCHIVED')
    ? `<div class="hint">Archivado: ${escapeHTML(archiveReasonToEs(knot.archiveReason))} · ${escapeHTML(formatTimeAgo(knot.archivedAt || knot.updatedAt))}</div>`
    : '';

  card.innerHTML = `
    <div class="title">${escapeHTML(knot.title)}</div>
    ${ctxLine}
    <div>
      ${statusBadge(knot.status)}
      ${scoreBadge(score)}
      <span class="kbd">${escapeHTML(reasonToEs(knot.blockReason))}</span>
      · fricción ${escapeHTML(String(friction))}
      · impacto ${escapeHTML(String(impact))}
      · sugerencia ${escapeHTML(String(score))}
    </div>
    ${archivedLine}
    <div class="hint">Último toque: ${escapeHTML(formatTimeAgo(knot.lastTouchedAt))}</div>

    <div class="quick-edit" data-qe>
      <div class="quick-row">
        <div>Fricción</div>
        <input type="range" min="1" max="5" value="${escapeHTML(String(friction))}" data-fr />
        <span class="pill" data-frv>${escapeHTML(String(friction))}</span>
      </div>

      <div class="quick-row">
        <div>Impacto</div>
        <input type="range" min="1" max="5" value="${escapeHTML(String(impact))}" data-im />
        <span class="pill" data-imv>${escapeHTML(String(impact))}</span>
      </div>

      <div class="hint">Sugerencia: impacto − fricción = <b data-score>${escapeHTML(String(score))}</b></div>
    </div>

    <div class="actions" data-actions></div>
  `;

  card.addEventListener('click', function () { showKnotDetail(knot.id); });

  const frSlider = card.querySelector('[data-fr]');
  const imSlider = card.querySelector('[data-im]');
  const frVal = card.querySelector('[data-frv]');
  const imVal = card.querySelector('[data-imv]');
  const scVal = card.querySelector('[data-score]');

  [frSlider, imSlider].forEach(el => {
    el.addEventListener('click', (e) => e.stopPropagation());
    el.addEventListener('mousedown', (e) => e.stopPropagation());
    el.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
  });

  let __deb = null;

  function refreshNumbers() {
    frVal.textContent = frSlider.value;
    imVal.textContent = imSlider.value;
    scVal.textContent = String((parseInt(imSlider.value, 10) || 3) - (parseInt(frSlider.value, 10) || 3));
  }

  function persistQuickEdit() {
    clearTimeout(__deb);
    __deb = setTimeout(() => {
      const newF = parseInt(frSlider.value, 10) || 3;
      const newI = parseInt(imSlider.value, 10) || 3;

      updateKnot({ id: knot.id, weight: newF, impact: newI });
      logEvent('QUICK_EDIT', { knotId: knot.id, friction: newF, impact: newI });

      renderInsights();
      renderToday();
    }, 200);
  }

  frSlider.addEventListener('input', () => { refreshNumbers(); persistQuickEdit(); });
  imSlider.addEventListener('input', () => { refreshNumbers(); persistQuickEdit(); });

  const actions = card.querySelector('[data-actions]');

  if (knot.status === 'DOING') {
    actions.appendChild(
      makeBtn('⏱ Hacer 5 min', 'small btn-primary', (e) => {
        e.stopPropagation();
        startFiveMin(knot.id);
        showFocus5MinModal(knot.id);
      })
    );
    actions.appendChild(makeBtn('Pausar', 'small', (e) => {
      e.stopPropagation();
      stopFiveMin('PAUSE_FROM_CARD');
      handlePauseDoing(knot.id);
    }));
    actions.appendChild(makeBtn('Marcar HECHO', 'small btn-primary', (e) => {
      e.stopPropagation();
      stopFiveMin('DONE_FROM_CARD');
      handleDone(knot.id);
    }));
  } else if (knot.status === 'UNLOCKABLE') {
    actions.appendChild(makeBtn('Iniciar', 'small', (e) => { e.stopPropagation(); handleStartDoing(knot.id); }));
    actions.appendChild(makeBtn('Mandar a ALGÚN DÍA', 'small', (e) => { e.stopPropagation(); transitionToSomeday(knot.id); renderToday(); }));
    actions.appendChild(makeBtn('🧩 Dividir', 'small', (e) => { e.stopPropagation(); showSplitKnotModal(knot.id); }));
  } else if (knot.status === 'SOMEDAY') {
    actions.appendChild(makeBtn('Editar', 'small btn-primary', (e) => { e.stopPropagation(); showEditSomedayModal(knot.id); }));
    actions.appendChild(makeBtn('🛠 Pasar a DESBLOQUEABLE', 'small', (e) => { e.stopPropagation(); convertSomedayToUnlockable(knot.id); }));
    actions.appendChild(makeBtn('🧩 Dividir', 'small', (e) => { e.stopPropagation(); showSplitKnotModal(knot.id); }));
    actions.appendChild(makeBtn('Eliminar', 'small btn-danger', (e) => {
      e.stopPropagation();
      if (confirm('¿Eliminar este nudo?')) {
        deleteKnot(knot.id);
        renderToday();
        renderInsights();
        const d = document.getElementById('knot-detail');
        if (d) d.style.display = 'none';
      }
    }));
  } else if (knot.status === 'BLOCKED') {
    actions.appendChild(makeBtn('Eliminar', 'small btn-danger', (e) => {
      e.stopPropagation();
      if (confirm('¿Eliminar este nudo?')) {
        deleteKnot(knot.id);
        renderToday();
        renderInsights();
        const d = document.getElementById('knot-detail');
        if (d) d.style.display = 'none';
      }
    }));
  } else if (knot.status === 'DONE') {
    actions.appendChild(makeBtn('Ver detalle', 'small', (e) => { e.stopPropagation(); showKnotDetail(knot.id); }));
  } else if (knot.status === 'ARCHIVED') {
    actions.appendChild(makeBtn('Ver detalle', 'small', (e) => { e.stopPropagation(); showKnotDetail(knot.id); }));
    actions.appendChild(makeBtn('Restaurar (ALGÚN DÍA)', 'small btn-primary', (e) => {
      e.stopPropagation();
      restoreArchivedToSomeday(knot.id);
      renderToday();
      renderInsights();
    }));
    actions.appendChild(makeBtn('Eliminar', 'small btn-danger', (e) => {
      e.stopPropagation();
      if (confirm('¿Eliminar este archivado?')) {
        deleteKnot(knot.id);
        renderToday();
        renderInsights();
        const d = document.getElementById('knot-detail');
        if (d) d.style.display = 'none';
      }
    }));
  }

  return card;
}

/***********************
 * HECHOS: agrupar por día (últimos 7 días)
 ***********************/
function dayKey(ts) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}
function dayLabel(key) {
  const parts = key.split('-');
  const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  return d.toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: 'long' });
}

function renderDoneGrouped(doneKnots) {
  const doneContainer = document.getElementById('done-container');
  if (!doneContainer) return;

  if (!doneKnots.length) {
    doneContainer.innerHTML = '<div class="notice">Todavía nada. Con 1 hecho chico ya cambia el día.</div>';
    return;
  }

  const groups = {};
  doneKnots.forEach(k => {
    const ts = k.doneAt || k.updatedAt || k.lastTouchedAt || k.createdAt || Date.now();
    const key = dayKey(ts);
    if (!groups[key]) groups[key] = [];
    groups[key].push(k);
  });

  const days = Object.keys(groups).sort((a, b) => (a < b ? 1 : -1));

  let html = `<div class="notice"><b>${doneKnots.length}</b> hecho(s) en los últimos 7 días.</div>`;

  days.forEach(key => {
    const items = groups[key].sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));

    html += `
      <div class="done-day">
        <div class="done-day-title">${escapeHTML(dayLabel(key))} · ${items.length}</div>
        <div class="done-mini">
          ${items.map(k => `<span class="kbd">✅ ${escapeHTML(k.title)}</span>`).join(' ')}
        </div>
      </div>
    `;
  });

  doneContainer.innerHTML = html;
}

/***********************
 * Render Hoy
 ***********************/
function renderToday() {
  migrateKnotContextsOnce();

  const allKnots = getKnots();
  const filter = getActiveContextFilter();

  // OJO: ARCHIVED no participa de HOY
  const visible = allKnots
    .filter(k => k.status !== 'ARCHIVED')
    .filter(k => isKnotVisibleInFilter(k, filter));

  const doing = visible.find(k => k.status === 'DOING');

  const unlockables = visible
    .filter(k => k.status === 'UNLOCKABLE')
    .filter(k => {
      if (filter === CONTEXT_FILTER.ALL) return true;
      const kctx = getKnotContext(k);
      return kctx === filter 
    })
    .sort((a, b) => {
      const fa = getFriction(a) - getFriction(b);
      if (fa !== 0) return fa;

      const ib = getImpact(b) - getImpact(a);
      if (ib !== 0) return ib;

      return (a.lastTouchedAt || 0) - (b.lastTouchedAt || 0);
    });

  const doneKnots = visible
    .filter(k => k.status === 'DONE')
    .sort((a, b) => (b.doneAt || b.updatedAt || 0) - (a.doneAt || a.updatedAt || 0));

  let backlog = visible
  .filter(k => ['BLOCKED', 'SOMEDAY'].includes(k.status))
  .filter(k => {
    if (filter === CONTEXT_FILTER.ALL) return true;
    return getKnotContext(k) === filter;   // ✅ NO deja pasar ANY
  });


  if (backlogSortMode === 'friction') backlog.sort((a, b) => getFriction(b) - getFriction(a));
  else if (backlogSortMode === 'impact') backlog.sort((a, b) => getImpact(b) - getImpact(a));
  else backlog.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  const doingContainer = document.getElementById('doing-container');
  if (doingContainer) {
    doingContainer.innerHTML = '';
    if (doing) doingContainer.appendChild(createKnotCard(doing));
    else doingContainer.innerHTML = '<div class="notice">Nada en progreso. Elegí 1 DESBLOQUEABLE y empezá.</div>';
  }

  const unlockableContainer = document.getElementById('unlockable-container');
  if (unlockableContainer) {
    unlockableContainer.innerHTML = '';
    if (!unlockables.length) unlockableContainer.innerHTML = '<div class="notice">No hay DESBLOQUEABLES. Capturá un nudo (si hay cupo).</div>';
    else unlockables.forEach(k => unlockableContainer.appendChild(createKnotCard(k)));
  }

  renderDoneGrouped(doneKnots);

  const backlogContainer = document.getElementById('backlog-container');
  if (backlogContainer) {
    backlogContainer.innerHTML = '';
    if (!backlog.length) backlogContainer.innerHTML = '<div class="notice">Backlog vacío.</div>';
    else backlog.forEach(k => backlogContainer.appendChild(createKnotCard(k)));
  }

  const fw = document.getElementById('filter-friction');
  const fi = document.getElementById('filter-impact');
  const fr = document.getElementById('filter-recent');
  if (fw && fi && fr) {
    fw.className = ('btn small ' + (backlogSortMode === 'friction' ? 'btn-primary' : '')).trim();
    fi.className = ('btn small ' + (backlogSortMode === 'impact' ? 'btn-primary' : '')).trim();
    fr.className = ('btn small ' + (backlogSortMode === 'recent' ? 'btn-primary' : '')).trim();
  }

  if (typeof updateCaptureButton === 'function') updateCaptureButton();

  try {
    const goal = getDailyGoal();
    const doneToday = countDoneToday();
    const marquee = document.querySelector('#section-today .marquee span');
    if (marquee) {
      if (doneToday < goal) {
        marquee.textContent = `👉 HOY: faltan ${goal - doneToday} HECHO(s) para tu mínimo · elegí 1 desbloqueable · hacé 5 min · cerrá o pausá · repetí`;
      } else {
        marquee.textContent = `👉 HOY: mínimo cumplido · mantené la cadena · elegí 1 desbloqueable · hacé 5 min · cerrá o pausá · repetí`;
      }
    }
  } catch (_) { }

  syncTimerChip();
}

/***********************
 * Detalle (+ editar contexto manual + restore/delete si archivado)
 ***********************/
function showKnotDetail(id) {
  const knot = getKnotById(id);
  if (!knot) return;

  const friction = getFriction(knot);
  const impact = getImpact(knot);
  const score = priorityScore(knot);
  const ctx = getKnotContext(knot);
  const ctxSrc = getContextSource(knot);

  const detail = document.getElementById('knot-detail');
  const content = document.getElementById('knot-detail-content');
  if (!detail || !content) return;

  let html =
    `<h3>${escapeHTML(knot.title)}</h3>` +
    `<div>${statusBadge(knot.status)} ${scoreBadge(score)}</div>` +
    `<div class="notice">
      <b>Motivo:</b> ${escapeHTML(reasonToEs(knot.blockReason))}<br/>
      <b>Fricción:</b> ${escapeHTML(String(friction))} · <b>Impacto:</b> ${escapeHTML(String(impact))}<br/>
      <b>Sugerencia:</b> ${escapeHTML(String(score))}
    </div>`;

  if (knot.status === 'ARCHIVED') {
    html += `<div class="notice">
      <b>Archivado por:</b> ${escapeHTML(archiveReasonToEs(knot.archiveReason))}<br/>
      <b>Cuándo:</b> ${escapeHTML(formatTimeAgo(knot.archivedAt || knot.updatedAt))}
    </div>`;
  }

  if (knot.nextStep) html += `<div><b>Próximo paso:</b> ${escapeHTML(knot.nextStep)}</div>`;
  if (knot.estMinutes) html += `<div><b>Minutos estimados:</b> ${escapeHTML(String(knot.estMinutes))}</div>`;
  if (knot.externalWait) html += `<div><b>Espera externa:</b> ${escapeHTML(knot.externalWait)}</div>`;
  if (knot.doneAt) html += `<div><b>Hecho:</b> ${escapeHTML(formatTimeAgo(knot.doneAt))}</div>`;

  html += `
    <hr/>
    <div class="panel">
      <h3>Contexto</h3>
      <div class="hint">Actual: ${contextBadge(ctx)} <span class="hint">(${ctxSrc === 'MANUAL' ? 'manual' : 'auto'})</span></div>
      <div class="row" style="margin-top:8px;">
        <select id="detail-ctx">
          <option value="AUTO">Auto (heurística/heredar)</option>
          <option value="HOME">🏠 Casa</option>
          <option value="STREET">🚶 Calle</option>
          <option value="WORK">💼 Trabajo</option>
          <option value="ANY">🌐 General</option>
        </select>
        <button id="detail-ctx-save" class="btn btn-primary">Guardar</button>
      </div>
      <div class="hint" style="margin-top:6px;">
        “Auto” deja que el sistema sugiera; “Manual” lo fija y no se pisa.
      </div>
    </div>
  `;

  // acciones extra en detalle
  html += `<div class="row" style="margin-top:10px;">`;

  if (knot.status === 'ARCHIVED') {
    html += `
      <button id="detail-restore" class="btn btn-primary">Restaurar como ALGÚN DÍA</button>
      <button id="detail-delete" class="btn btn-danger">Eliminar</button>
    `;
  } else {
    html += `
      <button id="detail-delete" class="btn btn-danger">Eliminar</button>
    `;
  }

  html += `</div>`;

  html +=
    `<hr/>` +
    `<div class="hint"><b>Creado:</b> ${escapeHTML(formatTimeAgo(knot.createdAt))}</div>` +
    `<div class="hint"><b>Actualizado:</b> ${escapeHTML(formatTimeAgo(knot.updatedAt))}</div>` +
    `<div class="hint"><b>Último toque:</b> ${escapeHTML(formatTimeAgo(knot.lastTouchedAt))}</div>`;

  content.innerHTML = html;
  detail.style.display = 'block';

  // set select default
  const sel = document.getElementById('detail-ctx');
  if (sel) {
    sel.value = (ctxSrc === 'MANUAL') ? ctx : 'AUTO';
  }

  const saveBtn = document.getElementById('detail-ctx-save');
  if (saveBtn) {
    saveBtn.onclick = () => {
      const pick = (document.getElementById('detail-ctx')?.value || 'AUTO').toUpperCase();
      if (pick === 'AUTO') {
        // Recalcular auto con heurística (título + nextStep) y marcar AUTO
        const autoCtx = suggestContextForNewKnot(knot.title, knot.nextStep || '');
        setKnotContextAuto(knot.id, autoCtx);
      } else {
        setKnotContextManual(knot.id, pick);
      }
      renderToday();
      renderInsights();
      showKnotDetail(knot.id);
    };
  }

  const delBtn = document.getElementById('detail-delete');
  if (delBtn) {
    delBtn.onclick = () => {
      if (!confirm('¿Eliminar este nudo?')) return;
      deleteKnot(knot.id);
      renderToday();
      renderInsights();
      detail.style.display = 'none';
    };
  }

  const restoreBtn = document.getElementById('detail-restore');
  if (restoreBtn) {
    restoreBtn.onclick = () => {
      restoreArchivedToSomeday(knot.id);
      renderToday();
      renderInsights();
      showKnotDetail(knot.id);
    };
  }
}

/***********************
 * Capturar nudo – MODAL COMPLETO
 ***********************/
function showCaptureModal() {
  const content =
    `<h3>Capturar nudo</h3>
     <div class="notice">
       Regla: si hay <b>EN PROGRESO</b> o ya tenés <b>3 DESBLOQUEABLES</b>, no podés capturar.
     </div>

     <form id="capture-form">
       <div class="field">
         <label for="title">Título</label>
         <input id="title" placeholder="Ej: pagar impuesto, llamar al médico..." required />
       </div>

       <div class="field">
         <label for="contextPick">Contexto</label>
         <select id="contextPick">
           <option value="AUTO">Auto-detectar (según filtro/heurística)</option>
           <option value="HOME">🏠 Casa</option>
           <option value="STREET">🚶 Calle</option>
           <option value="WORK">💼 Trabajo</option>
           <option value="ANY">🌐 General (sin contexto)</option>
         </select>
         <div class="hint">Tip: si estás en WORK pero esto es de la calle, elegí “Calle”.</div>
       </div>

       <div class="field">
         <label for="blockReason">Motivo del bloqueo</label>
         <select id="blockReason" required>
           <option value="NO_START">No sé por dónde empezar</option>
           <option value="LAZINESS">Pereza</option>
           <option value="FEAR">Miedo</option>
           <option value="EXTERNAL">Depende de un externo</option>
           <option value="NOT_TODAY">No hoy</option>
         </select>
       </div>

       <div id="nextStep-container" class="field">
         <label for="nextStep">Próximo paso (obligatorio en “no sé / pereza / miedo”)</label>
         <input id="nextStep" placeholder="Ej: abrir la web y buscar el trámite" />
       </div>

       <div id="estMinutes-container" class="field">
         <label for="estMinutes">Minutos estimados (máx 5 en “no sé / pereza / miedo”)</label>
         <input id="estMinutes" type="number" min="1" max="60" value="5" />
       </div>

       <div id="externalWait-container" class="field" style="display:none;">
         <label for="externalWait">Espera externa (obligatorio si depende de externo)</label>
         <input id="externalWait" placeholder="Ej: respuesta del banco / turno / aprobación" />
       </div>

       <div class="row">
         <div class="field" style="flex:1;">
           <label for="friction">Fricción (1–5)</label>
           <input id="friction" type="number" min="1" max="5" value="3" />
         </div>

         <div class="field" style="flex:1;">
           <label for="impact">Impacto (1–5)</label>
           <input id="impact" type="number" min="1" max="5" value="3" />
         </div>
       </div>

       <div class="row">
         <button type="submit" class="btn btn-primary">Crear</button>
         <button type="button" id="cancel-capture" class="btn">Cancelar</button>
       </div>
     </form>`;

  showModal(content, { showClose: false });

  const ctxPick = document.getElementById('contextPick');
  if (ctxPick) ctxPick.value = 'AUTO';

  document.getElementById('cancel-capture').onclick = () => hideModal();

  const form = document.getElementById('capture-form');
  const reasonSel = document.getElementById('blockReason');

  function refreshFields() {
    const reason = reasonSel.value;
    const needsNext = ['NO_START', 'LAZINESS', 'FEAR'].includes(reason);
    document.getElementById('nextStep-container').style.display = needsNext ? 'grid' : 'none';
    document.getElementById('estMinutes-container').style.display = needsNext ? 'grid' : 'none';
    document.getElementById('externalWait-container').style.display = (reason === 'EXTERNAL') ? 'grid' : 'none';
  }
  reasonSel.addEventListener('change', refreshFields);
  refreshFields();

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    try {
      const title = document.getElementById('title').value.trim();
      const nextStep = (document.getElementById('nextStep').value || '').trim() || null;

      const pick = (document.getElementById('contextPick')?.value || 'AUTO').toUpperCase();

      let ctx = CONTEXTS.ANY;
      let ctxSource = 'AUTO';

      if (pick === 'HOME' || pick === 'STREET' || pick === 'WORK' || pick === 'ANY') {
        ctx = normalizeContext(pick, false);
        ctxSource = 'MANUAL';
      } else {
        // AUTO: primero hereda el filtro si no es ALL
        const f = getActiveContextFilter();
        if (f !== CONTEXT_FILTER.ALL) {
          ctx = normalizeContext(f, false);
        } else {
          // en ALL: heurística
          ctx = suggestContextForNewKnot(title, nextStep || '');
        }
        ctxSource = 'AUTO';
      }

      const knot = {
        id: generateUUID(),
        title,
        context: ctx,
        contextSource: ctxSource,
        blockReason: reasonSel.value,
        nextStep: nextStep,
        estMinutes: parseInt(document.getElementById('estMinutes').value, 10) || 5,
        externalWait: (document.getElementById('externalWait').value || '').trim() || null,
        weight: parseInt(document.getElementById('friction').value, 10) || 3,
        impact: parseInt(document.getElementById('impact').value, 10) || 3,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastTouchedAt: Date.now(),
        status: ''
      };

      const validated = validateNewKnot(knot);
      createKnot(validated);

      hideModal();
      renderToday();
      renderInsights();
    } catch (err) {
      alert(err.message);
    }
  });
}

/***********************
 * Modal sistema lleno
 ***********************/
function showSystemFullModal(message) {
  const knots = getKnots().filter(k => k.status !== 'ARCHIVED');
  const unlockables = knots.filter(k => k.status === 'UNLOCKABLE');
  const doing = knots.find(k => k.status === 'DOING');

  let content = `<h3>Sistema lleno</h3><div class="notice">${escapeHTML(message)}</div>`;

  if (unlockables.length > 0) {
    content += `<hr/><div><b>Degradar a ALGÚN DÍA:</b></div><div class="row">`;
    unlockables.forEach(k => {
      content += `<button class="btn small" data-deg="${escapeHTML(k.id)}">${escapeHTML(k.title)}</button>`;
    });
    content += `</div>`;
  }

  if (doing) {
    content += `<hr/><div><b>Pausar EN PROGRESO:</b></div>
      <div class="row">
        <button class="btn small" id="pause-doing">${escapeHTML(doing.title)}</button>
      </div>`;
  }

  showModal(content, { showClose: true });

  unlockables.forEach(k => {
    const b = document.querySelector(`[data-deg="${CSS.escape(k.id)}"]`);
    if (b) {
      b.onclick = () => {
        transitionToSomeday(k.id);
        hideModal();
        renderToday();
        renderInsights();
      };
    }
  });

  if (doing) {
    const p = document.getElementById('pause-doing');
    if (p) {
      p.onclick = () => {
        handlePauseDoing(doing.id);
        hideModal();
        renderToday();
        renderInsights();
      };
    }
  }
}

/***********************
 * Handlers transición
 ***********************/
function handleStartDoing(id) {
  try {
    transitionToDoing(id);
    renderToday();
  } catch (err) {
    showModal(
      `<h3>No se puede iniciar</h3>
       <div class="notice">${escapeHTML(err.message)}</div>
       <div class="row">
         <button class="btn btn-primary" id="ask-pause">Pausar el actual</button>
         <button class="btn" id="ask-cancel">Cancelar</button>
       </div>`,
      { showClose: false }
    );

    document.getElementById('ask-cancel').onclick = hideModal;
    document.getElementById('ask-pause').onclick = function () {
      const doing = getKnots().find(k => k.status === 'DOING');
      if (doing) {
        try {
          handlePauseDoing(doing.id);
          transitionToDoing(id);
          hideModal();
          renderToday();
        } catch (e2) {
          hideModal();
          showSystemFullModal(e2.message);
        }
      } else {
        hideModal();
      }
    };
  }
}

function handlePauseDoing(id) {
  try {
    transitionToPauseDoing(id);
    renderToday();
  } catch (err) {
    showModal(
      `<h3>No se puede pausar</h3>
       <div class="notice">${escapeHTML(err.message)}</div>
       <div class="row">
         <button class="btn btn-primary" id="open-system">Resolver ahora</button>
         <button class="btn" id="close-me">Cerrar</button>
       </div>`,
      { showClose: false }
    );
    document.getElementById('close-me').onclick = hideModal;
    document.getElementById('open-system').onclick = function () {
      hideModal();
      showSystemFullModal(err.message);
    };
  }
}

function handleDone(id) {
  const content =
    `<h3>Cierre</h3>
     <div class="notice">¿Bajó la carga mental?</div>
     <div class="row">
       <button class="btn btn-primary" id="felt-yes">Sí</button>
       <button class="btn" id="felt-no">No</button>
     </div>
     <div class="hint">Esto solo entrena el cerebro a asociar “hacer” con alivio.</div>`;

  showModal(content, { showClose: false });

  document.getElementById('felt-yes').onclick = function () {
    transitionToDone(id, true);
    hideModal();
    renderToday();
    renderInsights();
  };

  document.getElementById('felt-no').onclick = function () {
    transitionToDone(id, false);
    hideModal();
    renderToday();
    renderInsights();
  };
}

/***********************
 * Convertir / editar / split / modos
 ***********************/
function convertSomedayToUnlockable(id) {
  const knot = getKnotById(id);
  if (!knot) return;

  const can = canMoveToUnlockable(id);
  if (!can) {
    showModal(`<h3>No hay cupo</h3><div class="notice">Ya tenés 3 DESBLOQUEABLES.</div>`);
    return;
  }

  showModal(
    `<h3>Pasar a DESBLOQUEABLE</h3>
     <div class="notice">Definí un próximo paso y un límite corto.</div>

     <div class="field">
       <label>Próximo paso</label>
       <input id="c-next" value="${escapeHTML(knot.nextStep || '')}" />
     </div>

     <div class="field">
       <label>Minutos estimados</label>
       <input id="c-min" type="number" min="1" max="60" value="${escapeHTML(String(knot.estMinutes || 5))}" />
     </div>

     <div class="row">
       <button class="btn btn-primary" id="c-ok">Listo</button>
       <button class="btn" id="c-cancel">Cancelar</button>
     </div>`,
    { showClose: false }
  );

  document.getElementById('c-cancel').onclick = hideModal;

  document.getElementById('c-ok').onclick = function () {
    const next = (document.getElementById('c-next').value || '').trim();
    const mins = parseInt(document.getElementById('c-min').value, 10) || 5;

    if (!next) {
      alert('El próximo paso es obligatorio.');
      return;
    }

    updateKnot({
      id: id,
      status: 'UNLOCKABLE',
      nextStep: next,
      estMinutes: mins,
      blockReason: knot.blockReason === 'NOT_TODAY' ? 'NO_START' : knot.blockReason
    });

    hideModal();
    renderToday();
    renderInsights();
  };
}

function showEditSomedayModal(id) {
  const knot = getKnotById(id);
  if (!knot) return;

  const ctx = getKnotContext(knot);
  const ctxSrc = getContextSource(knot);

  showModal(
    `<h3>Editar ALGÚN DÍA</h3>

     <div class="field">
       <label>Título</label>
       <input id="e-title" value="${escapeHTML(knot.title)}" />
     </div>

     <div class="field">
       <label>Contexto</label>
       <select id="e-ctx">
         <option value="AUTO">Auto (heurística)</option>
         <option value="HOME">🏠 Casa</option>
         <option value="STREET">🚶 Calle</option>
         <option value="WORK">💼 Trabajo</option>
         <option value="ANY">🌐 General</option>
       </select>
       <div class="hint">Actual: ${contextBadge(ctx)} (${ctxSrc === 'MANUAL' ? 'manual' : 'auto'})</div>
     </div>

     <div class="row">
       <div class="field" style="flex:1;">
         <label>Fricción (1–5)</label>
         <input id="e-friction" type="number" min="1" max="5" value="${escapeHTML(String(getFriction(knot)))}" />
       </div>
       <div class="field" style="flex:1;">
         <label>Impacto (1–5)</label>
         <input id="e-impact" type="number" min="1" max="5" value="${escapeHTML(String(getImpact(knot)))}" />
       </div>
     </div>

     <div class="row">
       <button class="btn btn-primary" id="e-save">Guardar</button>
       <button class="btn" id="e-cancel">Cancelar</button>
     </div>`,
    { showClose: false }
  );

  const sel = document.getElementById('e-ctx');
  if (sel) sel.value = (ctxSrc === 'MANUAL') ? ctx : 'AUTO';

  document.getElementById('e-cancel').onclick = hideModal;
  document.getElementById('e-save').onclick = function () {
    const newTitle = (document.getElementById('e-title').value || '').trim();
    const newF = parseInt(document.getElementById('e-friction').value, 10) || 3;
    const newI = parseInt(document.getElementById('e-impact').value, 10) || 3;

    const pick = (document.getElementById('e-ctx')?.value || 'AUTO').toUpperCase();
    if (pick === 'AUTO') {
      const autoCtx = suggestContextForNewKnot(newTitle, knot.nextStep || '');
      setKnotContextAuto(id, autoCtx);
    } else {
      setKnotContextManual(id, pick);
    }

    updateKnot({ id, title: newTitle, weight: newF, impact: newI, updatedAt: Date.now() });

    hideModal();
    renderToday();
    renderInsights();
  };
}

/**
 * Split:
 * - crea micro-pasos (UNLOCKABLE o SOMEDAY si no hay cupo)
 * - archiva el original como ARCHIVED con reason SPLIT
 * - permite contexto por micro-paso:
 *    - AUTO (default) = hereda contexto del padre
 *    - o manual (HOME/STREET/WORK/ANY)
 */
function showSplitKnotModal(id) {
  const knot = getKnotById(id);
  if (!knot) return;

  const parentCtx = getKnotContext(knot);

  showModal(
    `<h3>Dividir nudo</h3>
     <div class="notice">Convertimos 1 monstruo en 2 micro-pasos.</div>

     <div class="field">
       <label>Micro paso 1</label>
       <input id="s1" />
     </div>
     <div class="field">
       <label>Contexto micro 1</label>
       <select id="s1-ctx">
         <option value="AUTO">Auto (hereda: ${escapeHTML(contextLabel(parentCtx))})</option>
         <option value="HOME">🏠 Casa</option>
         <option value="STREET">🚶 Calle</option>
         <option value="WORK">💼 Trabajo</option>
         <option value="ANY">🌐 General</option>
       </select>
     </div>

     <div class="field">
       <label>Micro paso 2</label>
       <input id="s2" />
     </div>
     <div class="field">
       <label>Contexto micro 2</label>
       <select id="s2-ctx">
         <option value="AUTO">Auto (hereda: ${escapeHTML(contextLabel(parentCtx))})</option>
         <option value="HOME">🏠 Casa</option>
         <option value="STREET">🚶 Calle</option>
         <option value="WORK">💼 Trabajo</option>
         <option value="ANY">🌐 General</option>
       </select>
     </div>

     <div class="row">
       <button class="btn btn-primary" id="split-ok">Crear micro-pasos</button>
       <button class="btn" id="split-cancel">Cancelar</button>
     </div>`,
    { showClose: false }
  );

  document.getElementById('split-cancel').onclick = hideModal;

  document.getElementById('split-ok').onclick = function () {
    const t1 = (document.getElementById('s1').value || '').trim();
    const t2 = (document.getElementById('s2').value || '').trim();

    if (!t1 && !t2) {
      alert('Escribí al menos un micro paso.');
      return;
    }

    function pickCtx(title, pickValue) {
      const pv = (pickValue || 'AUTO').toUpperCase();
      if (pv === 'HOME' || pv === 'STREET' || pv === 'WORK' || pv === 'ANY') {
        return { ctx: normalizeContext(pv, false), src: 'MANUAL' };
      }
      // AUTO = hereda contexto del padre
      return { ctx: parentCtx || CONTEXT.ANY, src: 'AUTO' };
    }

    const micro = [
      { title: t1, pick: document.getElementById('s1-ctx')?.value },
      { title: t2, pick: document.getElementById('s2-ctx')?.value }
    ].filter(x => !!x.title);

    micro.forEach(function (m) {
      const ctxInfo = pickCtx(m.title, m.pick);

      const nk = {
        id: generateUUID(),
        title: m.title,
        context: ctxInfo.ctx,
        contextSource: ctxInfo.src,
        blockReason: 'NO_START',
        nextStep: m.title,
        estMinutes: 5,
        externalWait: null,
        weight: 2,
        impact: Math.max(2, getImpact(knot) - 1),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastTouchedAt: Date.now(),
        status: 'UNLOCKABLE'
      };

      const unlockableCount = getKnots().filter(k => k.status === 'UNLOCKABLE').length;
      if (unlockableCount >= 3) nk.status = 'SOMEDAY';

      createKnot(nk);
    });

    // ✅ en vez de mandarlo al backlog, lo archivamos
    archiveKnot(id, 'SPLIT');

    hideModal();
    renderToday();
    renderInsights();
  };
}

/***********************
 * Panic / soft pick (sin cambios fuertes)
 ***********************/
function pickSoftTask() {
  const cands = getKnots()
    .filter(k => k.status === 'UNLOCKABLE')
    .filter(k => getFriction(k) <= 2)
    .sort((a, b) => getImpact(b) - getImpact(a));

  if (!cands.length) {
    showModal(`<h3>Avanzar sin sufrir</h3><div class="notice">No hay desbloqueables de fricción baja. Dividí uno pesado.</div>`);
    return;
  }

  const k = cands[0];

  showModal(
    `<h3>Avanzar sin sufrir</h3>
     <div class="notice">
       Elegido: <b>${escapeHTML(k.title)}</b><br/>
       Próximo paso: <b>${escapeHTML(k.nextStep || 'Hacer 5 minutos')}</b>
     </div>

     <div class="row">
       <button class="btn btn-primary" id="soft-go">Iniciar + 5 min</button>
       <button class="btn" id="soft-cancel">Cancelar</button>
     </div>`,
    { showClose: false }
  );

  document.getElementById('soft-cancel').onclick = hideModal;
  document.getElementById('soft-go').onclick = function () {
    hideModal();
    try { transitionToDoing(k.id); } catch (_) { }
    renderToday();
    startFiveMin(k.id);
    showFocus5MinModal(k.id);
  };
}

function panicNoThink() {
  const doing = getKnots().find(k => k.status === 'DOING');
  if (doing) {
    startFiveMin(doing.id);
    showFocus5MinModal(doing.id);
    return;
  }
  pickSoftTask();
}

/***********************
 * INSIGHTS + Archivados (colapsable + agrupado)
 ***********************/
function startOfWeekTsMonday() {
  const d = new Date();
  // 0=domingo, 1=lunes...
  const day = d.getDay();
  const diff = (day === 0) ? 6 : (day - 1);
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function countArchivedSplitsThisWeek() {
  const start = startOfWeekTsMonday();
  const knots = getKnots();
  return knots.filter(k =>
    k.status === 'ARCHIVED' &&
    (k.archiveReason === 'SPLIT') &&
    ((k.archivedAt || k.updatedAt || 0) >= start)
  ).length;
}

function renderArchivedPanel() {
  const knots = getKnots().filter(k => k.status === 'ARCHIVED');
  const collapsed = isArchivedCollapsed();

  const splitWeek = countArchivedSplitsThisWeek();

  const header = `
  <div class="panel panel-archived">
    <div
      id="archived-header"
      class="accordion-header ${collapsed ? '' : 'accordion-open'}"
      data-collapsed="${collapsed ? 'true' : 'false'}"
    >
      <div class="accordion-title">
        <span class="accordion-caret">▸</span>
        <h3 style="margin:0;">Archivados <span class="hint">(${knots.length})</span></h3>
      </div>
    </div>

    <div class="hint" style="margin-top:6px;">
      Motivos: SPLIT (se dividió), DONE_MERGE (fusionado), MANUAL (a mano), CLEANUP (limpieza).
      <br>Esta semana: <b>${splitWeek}</b> SPLIT (buena descomposición).
    </div>

    <div
      id="archived-body"
      class="accordion-body ${collapsed ? 'collapsed' : ''}"
      style="max-height:${collapsed ? '0' : '2000px'}; margin-top:10px;"
    ></div>
  </div>
`;

  // cuerpo agrupado por día + motivo
  function groupArchived(items) {
    const byDay = {};
    items.forEach(k => {
      const ts = k.archivedAt || k.updatedAt || k.lastTouchedAt || k.createdAt || Date.now();
      const day = dayKey(ts);
      const reason = String(k.archiveReason || 'OTHER').toUpperCase();
      if (!byDay[day]) byDay[day] = {};
      if (!byDay[day][reason]) byDay[day][reason] = [];
      byDay[day][reason].push(k);
    });
    return byDay;
  }

  const groups = groupArchived(knots);
  const days = Object.keys(groups).sort((a, b) => (a < b ? 1 : -1));

  // si está colapsado igual devolvemos header y el body se rellena luego
  // (wire se hace en renderInsights)
  return { header, days, groups, count: knots.length };
}

function renderInsights() {
  const knots = getKnots();

  const counts = {};
  ['BLOCKED', 'UNLOCKABLE', 'DOING', 'DONE', 'SOMEDAY', 'ARCHIVED'].forEach(function (status) {
    counts[status] = knots.filter(function (k) { return k.status === status; }).length;
  });

  const container = document.getElementById('insights-container');
  if (!container) return;

  const countsHtml = Object.keys(counts).map(function (k) {
    return `<div>${escapeHTML(statusToEs(k))}: <b>${escapeHTML(String(counts[k]))}</b></div>`;
  }).join('');

  const days = getDoneByDayLast7Days();
  const momentumHtml = renderMomentumBars(days);
  const goalHtml = renderDailyGoalPanel();

  const arch = renderArchivedPanel();

  container.innerHTML =
    `<div class="panel">
      <h3>Conteos por estado</h3>
      ${countsHtml}
    </div>
    ${goalHtml}
    ${momentumHtml}
    ${arch.header}
  `;

  // wire goal panel
  const inp = document.getElementById('daily-goal-input');
  const save = document.getElementById('daily-goal-save');
  const one = document.getElementById('daily-goal-one');

  if (save && inp) {
    save.onclick = () => {
      setDailyGoal(inp.value);
      renderInsights();
      updateGoalChip();
    };
  }
  if (one) {
    one.onclick = () => {
      setDailyGoal(1);
      renderInsights();
      updateGoalChip();
    };
  }

  // -------- Archivados: fill + accordion --------
  const body = document.getElementById('archived-body');

  function fillArchivedBody() {
    if (!body) return;

    const collapsed = isArchivedCollapsed();
    body.style.display = collapsed ? 'none' : 'block';
    if (collapsed) return;

    if (!arch.count) {
      body.innerHTML = `<div class="notice">Nada archivado todavía.</div>`;
      return;
    }

    let html = '';

    arch.days.forEach(day => {
      const reasons = Object.keys(arch.groups[day]).sort();
      html += `<div class="panel" style="margin-top:10px;">
        <div class="hint"><b>${escapeHTML(dayLabel(day))}</b></div>
      `;

      reasons.forEach(r => {
        const items = arch.groups[day][r].sort((a, b) => (b.archivedAt || b.updatedAt || 0) - (a.archivedAt || a.updatedAt || 0));
        html += `
          <div class="hint" style="margin-top:8px;"><b>${escapeHTML(r)}</b> · ${items.length}</div>
          <div class="row" style="flex-wrap:wrap; gap:8px; margin-top:6px;">
            ${items.map(k => `
              <button class="btn small" data-arch-open="${escapeHTML(k.id)}">
                🗃 ${escapeHTML(k.title)}
              </button>
            `).join('')}
          </div>
        `;
      });

      html += `</div>`;
    });

    body.innerHTML = html;

    // click archived -> detalle
    arch.days.forEach(day => {
      Object.keys(arch.groups[day]).forEach(r => {
        arch.groups[day][r].forEach(k => {
          const b = document.querySelector(`[data-arch-open="${CSS.escape(k.id)}"]`);
          if (!b) return;
          b.onclick = () => showKnotDetail(k.id);
        });
      });
    });
  }

  wireArchivedAccordion(container, fillArchivedBody);
  fillArchivedBody();

  updateGoalChip();
}

/***********************
 * Momentum (últimos 7 días)
 ***********************/
function getDoneByDayLast7Days() {
  const knots = getKnots();
  const now = new Date();
  const days = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = dayKey(d.getTime());
    days.push({ key, date: d, count: 0 });
  }

  const map = {};
  days.forEach(x => map[x.key] = x);

  knots
    .filter(k => k.status === 'DONE')
    .forEach(k => {
      const ts = k.doneAt || k.updatedAt || k.lastTouchedAt || k.createdAt;
      if (!ts) return;
      const key = dayKey(ts);
      if (map[key]) map[key].count++;
    });

  return days;
}

function renderMomentumBars(days) {
  const max = Math.max(1, ...days.map(d => d.count));
  const bars = days.map(d => {
    const w = Math.round((d.count / max) * 100);
    const label = d.date.toLocaleDateString('es-AR', { weekday: 'short' });
    return `
      <div style="display:grid; grid-template-columns: 60px 1fr 30px; gap:10px; align-items:center; margin:6px 0;">
        <div class="hint">${escapeHTML(label)}</div>
        <div style="height:14px; border-radius:999px; background:#eee; overflow:hidden;">
          <div style="height:100%; width:${w}%; background:#0b5ed7;"></div>
        </div>
        <div class="hint" style="text-align:right;"><b>${d.count}</b></div>
      </div>
    `;
  }).join('');

  const streak = (() => {
    let r = 0;
    for (let i = days.length - 1; i >= 0; i--) {
      if (days[i].count > 0) r++;
      else break;
    }
    return r;
  })();

  return `
    <div class="panel">
      <h3>Momentum (últimos 7 días)</h3>
      <div class="notice">
        Racha actual: <b>${streak}</b> día(s). Objetivo: <b>no cortar</b>.
      </div>
      ${bars}
      <div class="hint">Regla 0,01%: 1 HECHO por día = identidad nueva. No perfección.</div>
    </div>
  `;
}

/***********************
 * Alternativas para foco (switch sin castigo)
 ***********************/
let __goalAltState = { baseId: null, options: [] };
function clearGoalAlt() { __goalAltState.baseId = null; __goalAltState.options = []; }

/***********************
 * 5 minutos modal foco
 * (lo dejo igual que tu versión, asumimos que ya lo tenés completo)
 ***********************/
// IMPORTANTE: acá están tus funciones showFocus5MinModal / showAfter5MinModal / etc.
// Si en tu archivo original ya están como las pegaste, mantenelas tal cual.
// Yo no las re-escribo acá de nuevo para no duplicar 400 líneas.
// 👇👇👇
// ... (PEGÁ acá tus funciones showFocus5MinModal y showAfter5MinModal tal cual las tenías)

function showAfter5MinModal(knotId) {
  const knot = getKnotById(knotId);
  if (!knot) return;

  const content = `
    <h3>5 minutos listos</h3>
    <div class="notice">
      Bien. ¿Qué hacemos con <b>${escapeHTML(knot.title)}</b>?
    </div>

    <div class="row">
      <button id="a-repeat" class="btn btn-primary">Repetir 5 min</button>
      <button id="a-pause" class="btn">Pausar</button>
      <button id="a-done" class="btn">Marcar HECHO</button>
    </div>

    <div class="hint">
      Tip: si no terminó, lo normal es <b>pausar</b> o <b>repetir</b>.
    </div>
  `;

  showModal(content, { showClose: false });

  document.getElementById('a-repeat').onclick = () => {
    stopFiveMin('AFTER_REPEAT');
    hideModal();
    startFiveMin(knotId);
    showFocus5MinModal(knotId);
  };

  document.getElementById('a-pause').onclick = () => {
    stopFiveMin('AFTER_PAUSE');
    hideModal();
    handlePauseDoing(knotId);
  };

  document.getElementById('a-done').onclick = () => {
    stopFiveMin('AFTER_DONE');
    hideModal();
    handleDone(knotId);
  };
}

function showFocus5MinModal(knotId) {
  const knot = getKnotById(knotId);
  if (!knot) return;

  const step = knot.nextStep || 'Hacé cualquier avance mínimo';

  let altHtml = '';
  if (__goalAltState.baseId === knotId && __goalAltState.options.length) {
    altHtml = `
      <div class="notice">
        ¿No era este? Cambiar a:
        <div class="row" style="margin-top:8px;">
          ${__goalAltState.options.map((o, i) => `
            <button class="btn small" id="goal-alt-${i}">➡️ ${escapeHTML(o.title)}</button>
          `).join('')}
        </div>
        <div class="hint">Cambia el foco y reinicia el timer (sin castigo).</div>
      </div>
    `;
  }

  const content = `
    <h3>⏱ 5 minutos</h3>

    <div class="notice">
      <b>${escapeHTML(knot.title)}</b>
    </div>

    <div class="notice">
      Próximo paso:
      <br>
      <b>${escapeHTML(step)}</b>
    </div>

    ${altHtml}
    <div id="focus-timer" class="focus-timer">05:00</div>

    <div class="hint">
      No pienses. No optimices. <br>
      Solo hacé este paso hasta que termine el tiempo.
    </div>

    <div class="row">
      <button id="focus-done" class="btn btn-primary">Terminé</button>
      <button id="focus-pause" class="btn">Pausar</button>
    </div>
  `;

  showModal(content, { showClose: false });

  if (__goalAltState.baseId === knotId && __goalAltState.options.length) {
    __goalAltState.options.forEach((o, i) => {
      const b = document.getElementById(`goal-alt-${i}`);
      if (!b) return;
      b.onclick = () => {
        stopFiveMin('GOAL_SWITCH');

        try { handlePauseDoing(knotId); } catch (_) {}

        hideModal();
        clearGoalAlt();

        try {
          const target = ensureRunnableKnot(getKnotById(o.id));
          renderToday();
          startFiveMin(target.id);
          showFocus5MinModal(target.id);
          logEvent('GOAL_SWITCHED', { from: knotId, to: target.id });
        } catch (err) {
          showModal(`<h3>No se puede cambiar</h3><div class="notice">${escapeHTML(err.message)}</div>`);
        }
      };
    });
  }

  // showModal ya oculta el chip y marca __isModalOpen=true

  document.getElementById('focus-done').onclick = () => {
    stopFiveMin('FOCUS_DONE_CLICK');
    hideModal();
    showAfter5MinModal(knotId);
  };

  document.getElementById('focus-pause').onclick = () => {
    stopFiveMin('FOCUS_PAUSE_CLICK');
    hideModal();
    handlePauseDoing(knotId);
  };

  const timerEl = document.getElementById('focus-timer');
  timerEl.className = 'focus-timer timer-green';

  const interval = setInterval(() => {
    if (!__timerState.running || __timerState.knotId !== knotId) {
      clearInterval(interval);
      return;
    }

    const left = Math.max(0, __timerState.endAt - Date.now());
    const totalSeconds = Math.ceil(left / 1000);

    const m = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const s = String(totalSeconds % 60).padStart(2, '0');
    timerEl.textContent = `${m}:${s}`;

    if (totalSeconds <= 60) timerEl.className = 'focus-timer timer-red';
    else if (totalSeconds <= 120) timerEl.className = 'focus-timer timer-yellow';
    else timerEl.className = 'focus-timer timer-green';

    if (totalSeconds <= 0) {
      clearInterval(interval);
      timerEl.textContent = '00:00';
      setTimeout(() => {
        hideModal();
        showAfter5MinModal(knotId);
      }, 300);
    }
  }, 300);
}

// ---------------------------------------------------------------------------
// ⚠️  Desde acá para abajo: dejé tu bloque de “Cerrar meta” + reset total igual
//     (solo agregué renderInsights() donde correspondía).
// ---------------------------------------------------------------------------

/***********************
 * CERRAR META: helpers comunes
 ***********************/
function compareEasy(a, b) {
  const fa = getFriction(a), fb = getFriction(b);
  if (fa !== fb) return fa - fb;

  const ia = getImpact(a), ib = getImpact(b);
  if (ia !== ib) return ib - ia;

  const ta = (a.lastTouchedAt || a.createdAt || 0);
  const tb = (b.lastTouchedAt || b.createdAt || 0);
  return ta - tb;
}

function pickTopCandidates(limit) {
  const knots = getKnots().filter(k => k.status !== 'ARCHIVED');
  const out = [];

  const doing = knots.find(k => k.status === 'DOING');
  if (doing) out.push(doing);

  const unlockables = knots.filter(k => k.status === 'UNLOCKABLE').sort(compareEasy);
  unlockables.forEach(k => { if (!out.some(x => x.id === k.id)) out.push(k); });

  const someday = knots.filter(k => k.status === 'SOMEDAY').sort(compareEasy);
  someday.forEach(k => { if (!out.some(x => x.id === k.id)) out.push(k); });

  return out.slice(0, limit || 3);
}

function ensureRunnableKnot(k) {
  if (!k) throw new Error('Sin candidato.');

  if (k.status === 'DOING') return k;

  if (k.status === 'UNLOCKABLE') {
    transitionToDoing(k.id);
    return getKnotById(k.id);
  }

  if (k.status === 'SOMEDAY') {
    if (!canMoveToUnlockable(k.id)) {
      throw new Error('No hay cupo para convertir ALGÚN DÍA a DESBLOQUEABLE.');
    }
    const next = k.nextStep || 'Abrir y hacer 1 paso mínimo';
    updateKnot({
      id: k.id,
      status: 'UNLOCKABLE',
      blockReason: (k.blockReason === 'NOT_TODAY' ? 'NO_START' : (k.blockReason || 'NO_START')),
      nextStep: next,
      estMinutes: k.estMinutes || 5
    });
    transitionToDoing(k.id);
    return getKnotById(k.id);
  }

  throw new Error('Estado no accionable.');
}

/***********************
 * ANÁLISIS: Cerrar meta (1 click)
 ***********************/
function closeGoalOneClick() {
  const goal = getDailyGoal();
  const done = countDoneToday();
  if (done >= goal) {
    showModal(`<h3>Meta cumplida</h3><div class="notice">Ya hiciste ${done}/${goal}. Ganaste hoy.</div>`);
    return;
  }

  const top = pickTopCandidates(3);
  if (!top.length) {
    showModal(`<h3>Sin candidatos</h3><div class="notice">No hay nudos accionables. Capturá uno chico.</div>`);
    return;
  }

  let chosen = null;
  try {
    chosen = ensureRunnableKnot(top[0]);
  } catch (err) {
    showModal(`<h3>No se puede cerrar meta</h3><div class="notice">${escapeHTML(err.message)}</div>`);
    return;
  }

  __goalAltState.baseId = chosen.id;
  __goalAltState.options = top
    .filter(x => x && x.id !== chosen.id)
    .slice(0, 2)
    .map(x => ({ id: x.id, title: x.title || 'Nudo' }));

  renderToday();
  showSection('section-today');

  startFiveMin(chosen.id);
  showFocus5MinModal(chosen.id);

  logEvent('GOAL_CLOSE_ONE_CLICK', { knotId: chosen.id });
}

/***********************
 * NAV: Cerrar meta (ELEGIR)
 ***********************/
function closeGoalOneClickNav() {
  const knots = getKnots().filter(k => k.status !== 'ARCHIVED');
  const doing = knots.find(k => k.status === 'DOING');
  const unlockables = knots.filter(k => k.status === 'UNLOCKABLE').sort(compareEasy);
  const someday = knots.filter(k => k.status === 'SOMEDAY').sort(compareEasy);

  const goal = getDailyGoal();
  const done = countDoneToday();
  const missing = Math.max(0, goal - done);

  const renderItem = (k) => {
    const fr = getFriction(k);
    const im = getImpact(k);
    const step = k.nextStep ? ` · paso: <b>${escapeHTML(k.nextStep)}</b>` : '';
    const touched = k.lastTouchedAt ? ` · tocado ${escapeHTML(formatTimeAgo(k.lastTouchedAt))}` : '';
    return `
      <button class="btn small" data-pick="${escapeHTML(k.id)}">
        ${escapeHTML(k.title)}
      </button>
      <div class="hint" style="margin:4px 0 10px 0;">
        ${statusToEs(k.status)} · fr ${fr} · im ${im}${step}${touched}
      </div>
    `;
  };

  let html = `
    <h3>🎯 Cerrar la meta (elegir)</h3>
    <div class="notice">
      Hoy: <b>${done}</b> hecho(s). Meta: <b>${goal}</b>.
      ${missing > 0 ? `Te faltan <b>${missing}</b>.` : `Ya cumpliste.`}
    </div>
  `;

  if (doing) {
    html += `<hr/><div><b>EN PROGRESO</b>:</div>`;
    html += renderItem(doing);
  }

  if (unlockables.length) {
    html += `<hr/><div><b>DESBLOQUEABLES</b>:</div>`;
    unlockables.forEach(k => { html += renderItem(k); });
  } else {
    html += `<hr/><div class="notice">No hay DESBLOQUEABLES. Capturá uno para poder cerrarlo.</div>`;
  }

  if (someday.length) {
    html += `<hr/><div><b>ALGÚN DÍA</b>:</div>`;
    someday.slice(0, 5).forEach(k => { html += renderItem(k); });
    if (someday.length > 5) html += `<div class="hint">Mostrando 5. Ordenado por facilidad.</div>`;
  }

  html += `<div class="hint">Elegí uno y arrancamos 5 min. Sin debate.</div>`;

  showModal(html, { showClose: true });

  function wirePickButtons(list) {
    list.forEach(k => {
      const b = document.querySelector(`[data-pick="${CSS.escape(k.id)}"]`);
      if (!b) return;
      b.onclick = () => {
        try {
          hideModal();
          clearGoalAlt();

          const runnable = ensureRunnableKnot(getKnotById(k.id));
          renderToday();
          showSection('section-today');

          startFiveMin(runnable.id);
          showFocus5MinModal(runnable.id);

          logEvent('GOAL_CLOSE_PICKED_FROM_NAV', { knotId: runnable.id, fromStatus: k.status });
        } catch (err) {
          showModal(`<h3>No se puede iniciar</h3><div class="notice">${escapeHTML(err.message)}</div>`);
        }
      };
    });
  }

  wirePickButtons([...(doing ? [doing] : []), ...unlockables, ...someday.slice(0, 5)]);
}


function wireContextSwitch() {
  const root = document.getElementById('context-switch');
  if (!root) return;

  function paint() {
    const active = getActiveContextFilter(); // ya existe en tu ui.js
    root.querySelectorAll('.context-btn').forEach(btn => {
      const v = (btn.dataset.filter || '').toUpperCase();
      btn.classList.toggle('active', v === active);
    });
  }

  root.querySelectorAll('.context-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = (btn.dataset.filter || 'ALL').toUpperCase();
      setActiveContextFilter(v);  // ya existe y llama renderToday()
      paint(); // por si el nav no se re-renderiza
    });
  });

  paint();
}
function wireGist() {
  const cfg = document.getElementById('btn-gist-config');
  const load = document.getElementById('btn-cloud-load');
  const save = document.getElementById('btn-cloud-save');

  if (cfg) cfg.onclick = showGistConfigModal;
  if (load) load.onclick = handleCloudLoad;
  if (save) save.onclick = handleCloudSave;

}

/***********************
 * Init UI
 ***********************/
document.addEventListener('DOMContentLoaded', function () {
  setQuickEditHidden(isQuickEditHidden());

  const btnReset = document.getElementById('btn-reset-all');
  if (btnReset) {
    btnReset.onclick = handleResetAllData;
  }
  wireContextSwitch();
  wireGist();
  
});

/***********************
 * RESET TOTAL (BORRAR DATOS)
 ***********************/
function getNudosStoragePrefixes() {
  return ['nudos_', 'NUDOS_'];
}

function clearNudosLocalStorage() {
  const prefixes = getNudosStoragePrefixes();
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k) keys.push(k);
  }

  keys.forEach(k => {
    if (prefixes.some(p => k.startsWith(p))) {
      localStorage.removeItem(k);
    }
  });
}

function resetNudosAppState() {
  try { stopFiveMin('RESET_ALL'); } catch (_) { }
  try { __isModalOpen = false; } catch (_) { }
  try { clearGoalAlt(); } catch (_) { }
  try { backlogSortMode = 'friction'; } catch (_) { }
}

function hardConfirmReset() {
  const msg1 = 'Esto borra TODOS tus nudos y configuración local (en este navegador).';
  const msg2 = 'Escribí BORRAR para confirmar.';
  alert(msg1);

  const typed = prompt(msg2);
  return (typed || '').trim().toUpperCase() === 'BORRAR';
}

function handleResetAllData() {
  if (!hardConfirmReset()) return;

  clearNudosLocalStorage();
  resetNudosAppState();

  try { hideModal(); } catch (_) { }
  try { renderToday(); } catch (_) { }
  try { renderInsights(); } catch (_) { }
  try { updateGoalChip(); } catch (_) { }
  try { syncTimerChip(); } catch (_) { }

  alert('Listo. Datos borrados ✅');
  try { logEvent('RESET_ALL_DATA', { ok: true }); } catch (_) { }
}
function wireArchivedAccordion(container, fillArchivedBody) {
  const header = container.querySelector('#archived-header');
  const body = container.querySelector('#archived-body');
  const caret = container.querySelector('#archived-header .accordion-caret');
  if (!header || !body) return;

  // Estado inicial visual
  const startCollapsed = isArchivedCollapsed();
  header.dataset.collapsed = startCollapsed ? 'true' : 'false';
  header.classList.toggle('accordion-open', !startCollapsed);
  body.classList.toggle('collapsed', startCollapsed);
  body.style.maxHeight = startCollapsed ? '0' : '2000px';
  body.style.display = startCollapsed ? 'none' : 'block';
  if (caret) caret.textContent = startCollapsed ? '▸' : '▾';

  header.onclick = () => {
    const wasCollapsed = header.dataset.collapsed === 'true';
    const nowCollapsed = !wasCollapsed;

    header.dataset.collapsed = nowCollapsed ? 'true' : 'false';
    setArchivedCollapsed(nowCollapsed);

    header.classList.toggle('accordion-open', !nowCollapsed);
    body.classList.toggle('collapsed', nowCollapsed);

    if (nowCollapsed) {
      body.style.maxHeight = '0';
      body.style.display = 'none';
    } else {
      body.style.display = 'block';
      body.style.maxHeight = '2000px';
      if (typeof fillArchivedBody === 'function') fillArchivedBody();
    }

    if (caret) caret.textContent = nowCollapsed ? '▸' : '▾';
  };
}


