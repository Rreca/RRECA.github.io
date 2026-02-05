/**
 * touch-compat.js – Compatibilidad táctil multi-navegador (iOS, Android, desktop).
 *
 * - iOS/Safari: el "click" a veces no se dispara al tocar; aquí generamos un
 *   click sintético en touchend usando MouseEvent estándar.
 * - Android: si el usuario pone el dedo en un botón y desliza para hacer scroll,
 *   NO debe contarse como click; solo se dispara click cuando el toque fue
 *   un tap (sin movimiento significativo).
 *
 * Compatible con cualquier navegador que soporte touch events.
 */
(function () {
  'use strict';

  if (!('ontouchstart' in window)) return;

  var MOVE_THRESHOLD_PX = 12;
  var touchStartX = 0;
  var touchStartY = 0;
  var touchStartClickable = null;
  var touchMoved = false;

  var supportsPassive = false;
  try {
    var opts = Object.defineProperty({}, 'passive', { get: function () { supportsPassive = true; return true; } });
    window.addEventListener('testPassive', function () {}, opts);
    window.removeEventListener('testPassive', function () {}, opts);
  } catch (e) {}
  var passiveOpt = supportsPassive ? { passive: true } : false;
  var nonPassiveOpt = supportsPassive ? { passive: false } : false;

  function findClickable(el) {
    while (el && el !== document.body) {
      if (el.nodeType !== 1) { el = el.parentElement; continue; }
      var tag = (el.tagName || '').toUpperCase();
      if (tag === 'BUTTON' || tag === 'A') return el;
      if (el.getAttribute && el.getAttribute('role') === 'button') return el;
      if (el.className && typeof el.className === 'string' && el.className.indexOf('btn') !== -1) return el;
      if ((tag === 'SPAN' || tag === 'DIV') && el.className && typeof el.className === 'string' && el.className.indexOf('badge') !== -1) return el;
      if (tag === 'DIV' && el.className && typeof el.className === 'string' && el.className.indexOf('card') !== -1) return el;
      el = el.parentElement;
    }
    return null;
  }

  function isDisabled(el) {
    return el.disabled === true || (el.getAttribute && el.getAttribute('aria-disabled') === 'true');
  }

  function fireClick(el) {
    try {
      if (typeof MouseEvent === 'function') {
        var ev = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window
        });
        el.dispatchEvent(ev);
      } else {
        var ev = document.createEvent('MouseEvents');
        ev.initMouseEvent('click', true, true, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
        el.dispatchEvent(ev);
      }
    } catch (err) {
      try { el.click(); } catch (_) {}
    }
  }

  /* touchstart/touchmove: passive para no bloquear scroll; touchend: non-passive para poder preventDefault() */
  document.addEventListener('touchstart', function (e) {
    var t = e.target;
    var tag = (t.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    var clickable = findClickable(t);
    touchStartClickable = clickable;
    touchMoved = false;
    if (e.changedTouches && e.changedTouches.length) {
      touchStartX = e.changedTouches[0].clientX;
      touchStartY = e.changedTouches[0].clientY;
    } else {
      touchStartX = e.clientX || 0;
      touchStartY = e.clientY || 0;
    }
  }, passiveOpt);

  document.addEventListener('touchmove', function (e) {
    if (!touchStartClickable) return;
    var x, y;
    if (e.changedTouches && e.changedTouches.length) {
      x = e.changedTouches[0].clientX;
      y = e.changedTouches[0].clientY;
    } else {
      x = e.clientX || 0;
      y = e.clientY || 0;
    }
    var dx = x - touchStartX;
    var dy = y - touchStartY;
    if (dx * dx + dy * dy > MOVE_THRESHOLD_PX * MOVE_THRESHOLD_PX) {
      touchMoved = true;
    }
  }, passiveOpt);

  document.addEventListener('touchend', function (e) {
    var clickable = touchStartClickable;
    touchStartClickable = null;

    if (touchMoved || !clickable) return;
    if (isDisabled(clickable)) return;

    var target = e.target;
    var tag = (target.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    e.preventDefault();
    fireClick(clickable);
  }, nonPassiveOpt);
})();
