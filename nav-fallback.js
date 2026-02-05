/**
 * nav-fallback.js – Fallback para iPad mini 1ª gen / Safari antiguo.
 * Si ui.js o app.js fallan (p. ej. por ES6 no soportado), al menos Hoy y Análisis
 * funcionan con este script (ES5 puro, sin const/let/arrow/template).
 */
(function () {
  'use strict';

  function runFallback() {
    if (typeof showSection === 'function') return;

    var sectionToday = document.getElementById('section-today');
    var sectionInsights = document.getElementById('section-insights');
    var btnToday = document.getElementById('nav-today');
    var btnInsights = document.getElementById('nav-insights');

    function showOne(id) {
      if (sectionToday) sectionToday.style.display = (id === 'section-today') ? '' : 'none';
      if (sectionInsights) sectionInsights.style.display = (id === 'section-insights') ? '' : 'none';
    }

    if (btnToday) btnToday.onclick = function () { showOne('section-today'); };
    if (btnInsights) btnInsights.onclick = function () { showOne('section-insights'); };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(runFallback, 100);
    });
  } else {
    setTimeout(runFallback, 100);
  }
})();
