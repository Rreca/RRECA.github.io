/**
 * touch-compat.js – Compatibilidad táctil para iOS/iPad antiguos (ej. iPad mini 1ª gen).
 * En Safari antiguo, el "click" en botones a veces no se dispara al tocar;
 * este script hace que un toque (touchend) dispare la misma acción que el click.
 * Compatible con dispositivos modernos (no interfiere con mouse).
 */
(function () {
  'use strict';

  if (!('ontouchstart' in window)) return;

  function findClickable(el) {
    while (el && el !== document.body) {
      if (el.nodeType !== 1) { el = el.parentElement; continue; }
      var tag = (el.tagName || '').toUpperCase();
      if (tag === 'BUTTON' || tag === 'A') return el;
      if (el.getAttribute && el.getAttribute('role') === 'button') return el;
      if (el.className && typeof el.className === 'string' && el.className.indexOf('btn') !== -1) return el;
      /* Chips y elementos interactivos (ej. timer-chip) */
      if ((tag === 'SPAN' || tag === 'DIV') && el.className && typeof el.className === 'string' && el.className.indexOf('badge') !== -1) return el;
      el = el.parentElement;
    }
    return null;
  }

  document.addEventListener('touchend', function (e) {
    var target = e.target;
    var tag = (target.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    var clickable = findClickable(target);
    if (!clickable) return;
    if (clickable.disabled === true) return;
    if (clickable.getAttribute && clickable.getAttribute('aria-disabled') === 'true') return;
    e.preventDefault();
    try {
      var ev = document.createEvent('MouseEvents');
      ev.initMouseEvent('click', true, true, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
      clickable.dispatchEvent(ev);
    } catch (err) {
      try {
        clickable.click();
      } catch (_) {}
    }
  }, false);
})();
