/**
 * Freight Solutions — interaction tracking.
 *
 * Pushes events into the GTM dataLayer for contact surfaces and the quote form.
 * Observes; never intercepts, validates, or changes any behaviour.
 *
 * Events: phone_click, email_click, whatsapp_selected,
 *         quote_form_start, quote_form_step, quote_form_submit
 */
(function () {
  'use strict';

  var dl = (window.dataLayer = window.dataLayer || []);
  var ev = function (name, data) {
    dl.push(Object.assign({ event: name }, data || {}));
  };

  // SPA navigation happens through history.pushState, so the page never reloads
  // after the first. Patching once here means every later route change is seen.
  var pushView = function () {
    dl.push({ event: 'spa_page_view', page_path: location.pathname + location.search });
  };
  ['pushState', 'replaceState'].forEach(function (m) {
    var orig = history[m];
    if (orig.__fsPatched) return;
    var wrapped = function () {
      var r = orig.apply(this, arguments);
      pushView();
      return r;
    };
    wrapped.__fsPatched = true;
    history[m] = wrapped;
  });
  window.addEventListener('popstate', pushView);

  // --- Phone & email clicks (delegated, so it works under SPA navigation) ----
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href^="tel:"], a[href^="mailto:"]') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (href.indexOf('tel:') === 0) {
      ev('phone_click', { link_url: href, phone: href.slice(4) });
    } else if (href.indexOf('mailto:') === 0) {
      ev('email_click', { link_url: href, email: href.slice(7).split('?')[0] });
    }
  });

  // --- Quote form ------------------------------------------------------------
  var started = new WeakSet();

  var onFirstInput = function (form) {
    if (started.has(form)) return;
    started.add(form);
    ev('quote_form_start', { form_id: form.dataset.lang || '' });
  };

  // WhatsApp exists only as a contact-method radio option inside the quote form.
  // Track its selection — do not add links or change the form.
  var onRadio = function (input) {
    if (input.name !== 'contactMethod' || input.value !== 'whatsapp') return;
    ev('whatsapp_selected', { form_id: input.closest('[data-quote-form]').dataset.lang || '' });
  };

  document.addEventListener('input', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var form = t.closest('[data-quote-form]');
    if (!form) return;
    onFirstInput(form);
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t && t.type === 'radio' && t.closest && t.closest('[data-quote-form]')) onRadio(t);
  });

  // Submit: the form builds a mailto rather than POSTing, so this signals
  // "submit clicked / mail client opened", not confirmed delivery.
  document.addEventListener('submit', function (e) {
    var form = e.target && e.target.closest ? e.target.closest('[data-quote-form]') : null;
    if (!form) return;
    ev('quote_form_submit', { form_id: form.dataset.lang || '' });
  });

  // Step transitions: quote-runtime toggles [hidden] on [data-quote-step].
  // Observe the attribute rather than touching the runtime.
  var stepOf = function (el) {
    return el && el.dataset ? Number(el.dataset.quoteStep) : NaN;
  };
  var watchSteps = function (form) {
    if (form.__fsStepWatch) return;
    form.__fsStepWatch = true;
    var current = 1;
    new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (m.type !== 'attributes' && m.type !== 'childList') continue;
        var next = m.target.querySelector('[data-quote-step]:not([hidden])');
        var n = stepOf(next);
        if (!isNaN(n) && n !== current) {
          current = n;
          ev('quote_form_step', { step: n });
        }
      }
    }).observe(form, { attributes: true, attributeFilter: ['hidden'], subtree: true });
  };

  // Forms present in initial markup
  document.querySelectorAll('[data-quote-form]').forEach(watchSteps);
  // And forms injected later by the SPA shell
  new MutationObserver(function (mutations) {
    mutations.forEach(function (m) {
      m.addedNodes.forEach(function (n) {
        if (n.nodeType !== 1) return;
        if (n.matches && n.matches('[data-quote-form]')) watchSteps(n);
        n.querySelectorAll && n.querySelectorAll('[data-quote-form]').forEach(watchSteps);
      });
    });
  }).observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', pushView);
  } else {
    pushView();
  }
})();
