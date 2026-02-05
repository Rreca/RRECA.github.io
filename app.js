// file: app.js
// Bootstrap + navegación + wiring de botones globales

document.addEventListener('DOMContentLoaded', function () {
  initStore();

  try {
    if (typeof setQuickEditHidden === 'function' && typeof isQuickEditHidden === 'function') {
      setQuickEditHidden(isQuickEditHidden());
    }
  } catch (_) {}

  checkNudgeOnLoad();

  renderToday();
  updateCaptureButton();

  var btnToday = document.getElementById('nav-today');
  var btnInsights = document.getElementById('nav-insights');

  if (btnToday) {
    btnToday.addEventListener('click', function () {
      showSection('section-today');
      renderToday();
    });
  }

  if (btnInsights) {
    btnInsights.addEventListener('click', function () {
      showSection('section-insights');
      renderInsights();
      if (typeof updateGoalChip === 'function') updateGoalChip();
    });
  }

  var btnCapture = document.getElementById('btn-capture');
  if (btnCapture) btnCapture.addEventListener('click', handleCaptureClick);

  var btnExport = document.getElementById('btn-export');
  if (btnExport) btnExport.addEventListener('click', exportData);

  var btnImport = document.getElementById('btn-import');
  if (btnImport) {
    btnImport.addEventListener('click', function () {
      document.getElementById('input-import').click();
    });
  }

  var inputImport = document.getElementById('input-import');
  if (inputImport) inputImport.addEventListener('change', importData);

  var btnSoft = document.getElementById('btn-soft');
  var btnPanic = document.getElementById('btn-panic');

  if (btnSoft && typeof pickSoftTask === 'function') btnSoft.addEventListener('click', pickSoftTask);
  if (btnPanic && typeof panicNoThink === 'function') btnPanic.addEventListener('click', panicNoThink);

  // Toggle sliders mini
  var btnQuickToggle = document.getElementById('btn-quick-toggle');
  if (btnQuickToggle && typeof setQuickEditHidden === 'function' && typeof isQuickEditHidden === 'function') {
    btnQuickToggle.addEventListener('click', function () {
      setQuickEditHidden(!isQuickEditHidden());
      renderToday();
    });
  }

  // filtros backlog
  var fFriction = document.getElementById('filter-friction');
  var fImpact = document.getElementById('filter-impact');
  var fRecent = document.getElementById('filter-recent');

  if (fFriction) fFriction.addEventListener('click', function () { backlogSortMode = 'friction'; renderToday(); });
  if (fImpact) fImpact.addEventListener('click', function () { backlogSortMode = 'impact'; renderToday(); });
  if (fRecent) fRecent.addEventListener('click', function () { backlogSortMode = 'recent'; renderToday(); });

  // Cerrar panel detalle
  var closeBtn = document.getElementById('knot-detail-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', function () {
      var detail = document.getElementById('knot-detail');
      if (detail) detail.style.display = 'none';
    });
  }

  // ✅ NAV: elegir qué cerrar
  var btnCloseGoalNav = document.getElementById('btn-close-goalNav');
  if (btnCloseGoalNav && typeof closeGoalOneClickNav === 'function') {
    btnCloseGoalNav.addEventListener('click', closeGoalOneClickNav);
  }

  // ✅ ANÁLISIS: 1 click
  var btnCloseGoal = document.getElementById('btn-close-goal');
  if (btnCloseGoal && typeof closeGoalOneClick === 'function') {
    btnCloseGoal.addEventListener('click', function () {
      closeGoalOneClick();
      if (typeof updateGoalChip === 'function') updateGoalChip();
    });
  }
});

function showSection(sectionId) {
  document.querySelectorAll('main > section').forEach(function (sec) {
    sec.style.display = (sec.id === sectionId) ? 'block' : 'none';
  });
  var detail = document.getElementById('knot-detail');
  if (detail) detail.style.display = 'none';
}

function showSoftNudgeChip(knotId, days) {
  var chip = document.getElementById('timer-chip');
  if (!chip) return;

  var knot = getKnotById(knotId);
  var title = knot ? knot.title : 'Nudo';

  chip.style.display = 'inline-block';
  chip.className = 'badge doing';
  chip.style.cursor = 'pointer';
  chip.textContent = `🔁 Seguí 5 min · ${title} · evitado ${days}d`;

  chip.onclick = function () {
    try {
      if (typeof startFiveMin === 'function') startFiveMin(knotId);
      if (typeof showFocus5MinModal === 'function') showFocus5MinModal(knotId);
    } catch (_) {}
  };
}

function checkNudgeOnLoad() {
  var knots = getKnots();
  var now = Date.now();

  var doing = knots.find(function (k) { return k.status === 'DOING'; });

  var staleUnlockables = knots
    .filter(function (k) { return k.status === 'UNLOCKABLE'; })
    .sort(function (a, b) {
      return (a.lastTouchedAt || a.createdAt || now) - (b.lastTouchedAt || b.createdAt || now);
    });

  if (staleUnlockables.length === 0) return;

  var k = staleUnlockables[0];
  var lastTouch = k.lastTouchedAt || k.createdAt || now;
  var days = Math.max(1, Math.floor((now - lastTouch) / (24 * 60 * 60 * 1000)));

  if (doing) {
    showSoftNudgeChip(k.id, days);
    logEvent('NUDGE_SHOWN', { reason: 'UNLOCKABLE_STALE_48H_SOFT_CHIP', knotId: k.id });
    return;
  }

  function safeEscape(s) {
    try { return (typeof escapeHTML === 'function') ? escapeHTML(s) : String(s); }
    catch (_) { return String(s); }
  }
  function safeTimeAgo(ts) {
    try { return (typeof formatTimeAgo === 'function') ? formatTimeAgo(ts) : (days + ' día(s) atrás'); }
    catch (_) { return (days + ' día(s) atrás'); }
  }
  function safePriorityScore(knot) {
    try { return (typeof priorityScore === 'function') ? priorityScore(knot) : ((knot.impact || 3) - (knot.weight || 3)); }
    catch (_) { return ((knot.impact || 3) - (knot.weight || 3)); }
  }
  function safeScoreBadge(score) {
    try { return (typeof scoreBadge === 'function') ? scoreBadge(score) : ''; }
    catch (_) { return ''; }
  }
  function safeReason(knot) {
    try { return (typeof reasonToEs === 'function') ? reasonToEs(knot.blockReason) : (knot.blockReason || ''); }
    catch (_) { return (knot.blockReason || ''); }
  }

  var score = safePriorityScore(k);
  var hint = (score <= -2) ? 'Sugerencia: DIVIDIR' : (score >= 3 ? 'Sugerencia: HACÉLO YA' : 'Sugerencia: 5 minutos');

  showModal(
    '<h3>Recordatorio</h3>' +
    '<div class="notice">' +
      'Tu cerebro lo evitó hace <b>' + days + '</b> día(s). Elegí 1 acción.<br/>' +
      '<b>' + safeEscape(k.title || 'Nudo') + '</b><br/>' +
      '<span class="hint">Motivo: ' + safeEscape(safeReason(k)) + ' · Último toque: ' + safeEscape(safeTimeAgo(lastTouch)) + '</span><br/>' +
      (k.nextStep ? ('<div class="hint">Próximo paso: <b>' + safeEscape(k.nextStep) + '</b></div>') : '') +
      safeScoreBadge(score) + ' <span class="kbd">' + safeEscape(hint) + '</span>' +
    '</div>' +
    '<div class="row" style="margin-top:10px;">' +
      '<button id="nudge-view" class="btn">Ver</button>' +
      '<button id="nudge-5" class="btn btn-primary">⏱ Hacer 5 min</button>' +
      '<button id="nudge-split" class="btn">🧩 Dividir</button>' +
      '<button id="nudge-someday" class="btn">Mandar a ALGÚN DÍA</button>' +
    '</div>',
    { showClose: true }
  );

  document.getElementById('nudge-view').onclick = function () {
    hideModal();
    showSection('section-today');
    renderToday();
    if (typeof showKnotDetail === 'function') showKnotDetail(k.id);
  };

  document.getElementById('nudge-5').onclick = function () {
    hideModal();
    try { transitionToDoing(k.id); } catch (_) {}
    renderToday();
    if (typeof startFiveMin === 'function') startFiveMin(k.id);
    if (typeof showFocus5MinModal === 'function') showFocus5MinModal(k.id);
  };

  document.getElementById('nudge-split').onclick = function () {
    hideModal();
    showSection('section-today');
    renderToday();
    if (typeof showSplitKnotModal === 'function') showSplitKnotModal(k.id);
  };

  document.getElementById('nudge-someday').onclick = function () {
    hideModal();
    transitionToSomeday(k.id);
    renderToday();
  };

  logEvent('NUDGE_SHOWN', { reason: 'UNLOCKABLE_STALE_48H', knotId: k.id });
}

function handleCaptureClick() {
  var result = canCaptureNewKnot();
  if (!result.canCapture) {
    if (typeof showSystemFullModal === 'function') showSystemFullModal(result.message);
    else showModal('<div class="notice">' + escapeHTML(result.message) + '</div>');
    logEvent('NUDGE_SHOWN', { reason: 'CAPTURE_BLOCKED_SYSTEM_FULL' });
    return;
  }

  if (typeof showCaptureModal === 'function') {
    showCaptureModal();
  } else {
    showModal('<div class="notice">Falta showCaptureModal() en ui.js</div>');
  }
}

function updateCaptureButton() {
  var result = canCaptureNewKnot();
  var btn = document.getElementById('btn-capture');
  if (btn) btn.disabled = !result.canCapture;
}
