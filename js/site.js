(function () {
  'use strict';

  /* ==========================================================
     0. IMPACT CONFIG — the only place you edit the numbers.

     Update `totalRaised` after each monthly reconciliation and
     keep it at the real figure. This strip is the site's
     credibility; an inflated number is the fastest way to lose it.
     ========================================================== */

  var ARCADE_IMPACT_CONFIG = {

    /* Gross dollars taken in across all tips and sustainers. */
    totalRaised: 0,

    /* Share of net proceeds routed to relief (the rest is hosting/dev). */
    reliefShare: 0.5,

    /* Stripe's published rate, used only for the net estimate below. */
    stripePercent: 0.029,
    stripeFlatFee: 0.30,

    /* Roughly how many separate tips so far — used to estimate the
       per-transaction flat fee. Leave at 0 to skip fee estimating. */
    tipCount: 0,

    /* Next reconciliation + transfer date, exactly as displayed. */
    nextAudit: 'Oct 7',
    nextAuditFull: 'October 7, 2026',

    /* Cycle label shown in the readout subtitles. */
    cycle: 'Cycle 01',

    /* This cycle's partners. Each takes an equal share of the relief pool.
       `mealsPerDollar` is that organization's own published purchasing
       power; set it to null and the partner is left out of the estimate.
         - Feeding America network food banks commonly cite ~10 meals/$1.
           Confirm Westmoreland's own current figure before publishing it.
         - WCK field meals run roughly $2 each, so ~0.5 meals/$1. */
    partners: [
      { name: 'Westmoreland County Food Bank', short: 'WCFB', mealsPerDollar: 10 },
      { name: 'World Central Kitchen', short: 'WCK', mealsPerDollar: 0.5 }
    ]
  };

  window.ARCADE_IMPACT_CONFIG = ARCADE_IMPACT_CONFIG;

  /* ==========================================================
     1. IMPACT READOUT
     Pure presentation. No network, no storage, no tracking.
     ========================================================== */

  function commas(v) {
    return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function money(n) { return '$' + commas(n.toFixed(2)); }
  function moneyRound(n) { return '$' + commas(Math.round(n)); }

  function renderImpact() {
    var cfg = ARCADE_IMPACT_CONFIG;
    var gross = Number(cfg.totalRaised) || 0;
    var share = Number(cfg.reliefShare) || 0;
    var partners = cfg.partners || [];

    /* Estimated Stripe fees, then the relief pool from what is left. */
    var fees = gross > 0
      ? (gross * (Number(cfg.stripePercent) || 0)) + ((Number(cfg.tipCount) || 0) * (Number(cfg.stripeFlatFee) || 0))
      : 0;
    var net = Math.max(gross - fees, 0);
    var relief = net * share;
    var perPartner = partners.length ? relief / partners.length : 0;

    /* Meals estimate — each partner's own rate against its own share. */
    var meals = 0, rated = 0;
    for (var i = 0; i < partners.length; i++) {
      var rate = partners[i].mealsPerDollar;
      if (typeof rate === 'number' && rate > 0) {
        meals += perPartner * rate;
        rated++;
      }
    }
    meals = Math.floor(meals / 10) * 10;

    var el = {
      raised: document.getElementById('impact-raised'),
      raisedSub: document.getElementById('impact-raised-sub'),
      relief: document.getElementById('impact-relief'),
      reliefSub: document.getElementById('impact-relief-sub'),
      audit: document.getElementById('impact-audit'),
      foot: document.getElementById('impact-foot')
    };

    var preLaunch = gross <= 0;
    var names = [];
    for (var j = 0; j < partners.length; j++) names.push(partners[j].name);

    if (el.raised) el.raised.textContent = moneyRound(gross);
    if (el.raisedSub) el.raisedSub.textContent = preLaunch
      ? cfg.cycle + ' just opened — gross, since launch'
      : 'Gross, since launch';

    if (el.relief) el.relief.textContent = moneyRound(relief);
    if (el.reliefSub) {
      if (preLaunch) {
        el.reliefSub.textContent = 'First transfer posts ' + (cfg.nextAudit || 'soon');
      } else if (rated > 0) {
        el.reliefSub.textContent = 'Roughly ' + commas(meals) + ' meals funded (estimate)';
      } else {
        el.reliefSub.textContent = 'Split evenly between partners';
      }
    }

    if (el.audit) el.audit.textContent = cfg.nextAudit || 'TBD';

    if (el.foot) {
      el.foot.textContent = preLaunch
        ? cfg.cycle + ' opened at $0. Every dollar from here is logged, halved, and split between the ' +
        names.join(' and the ') + '. Nothing appears above until it has actually cleared. Next reconciliation ' +
        (cfg.nextAuditFull || cfg.nextAudit) + '.'
        : moneyRound(gross) + ' gross, less ' + money(fees) + ' in estimated Stripe fees, leaves ' +
        moneyRound(net) + ' net. ' + Math.round(share * 100) + '% of that (' + moneyRound(relief) +
        ') goes to relief — ' + moneyRound(perPartner) + ' each to the ' + names.join(' and the ') +
        '. Meal figures are estimates based on each organization’s own published cost per meal.';
    }
  }

  renderImpact();

  /* ==========================================================
     2. DIALOGS — ledger + about
     One controller drives both: open/close, ESC, backdrop
     click-dismiss, focus trap, focus restore.
     ========================================================== */

  var FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

  var activeScrim = null;
  var lastFocus = null;

  function openDialog(id) {
    var scrim = document.getElementById(id);
    if (!scrim || scrim === activeScrim) return;
    if (activeScrim) closeDialog();

    lastFocus = document.activeElement;
    scrim.hidden = false;
    scrim.classList.add('is-open');
    document.body.classList.add('is-locked');
    activeScrim = scrim;

    var dialog = scrim.querySelector('.dialog');
    var first = dialog ? dialog.querySelector(FOCUSABLE) : null;
    if (first) first.focus();
  }

  function closeDialog() {
    if (!activeScrim) return;
    activeScrim.classList.remove('is-open');
    activeScrim.hidden = true;
    activeScrim = null;
    document.body.classList.remove('is-locked');
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
  }

  function bindAll(selector, handler) {
    Array.prototype.forEach.call(document.querySelectorAll(selector), function (el) {
      el.addEventListener('click', handler);
    });
  }

  bindAll('[data-ledger-open]', function () { openDialog('ledger'); });
  bindAll('[data-about-open]', function () { openDialog('about-modal'); });
  bindAll('[data-modal-close]', closeDialog);

  /* Backdrop click-dismiss — only when the scrim itself is hit */
  Array.prototype.forEach.call(document.querySelectorAll('.scrim'), function (scrim) {
    scrim.addEventListener('click', function (e) {
      if (e.target === scrim) closeDialog();
    });
  });

  /* ESC to close, plus a focus trap while a dialog is open */
  document.addEventListener('keydown', function (e) {
    if (!activeScrim) return;

    if (e.key === 'Escape' || e.key === 'Esc') {
      e.preventDefault();
      closeDialog();
      return;
    }

    if (e.key === 'Tab') {
      var dialog = activeScrim.querySelector('.dialog');
      if (!dialog) return;

      var nodes = dialog.querySelectorAll(FOCUSABLE);
      if (!nodes.length) return;

      var first = nodes[0];
      var last = nodes[nodes.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  /* ==========================================================
     3. UNRELEASED CABINET FEEDBACK
     Disabled buttons swallow their own clicks, so the card
     listens instead and flashes the reason.
     ========================================================== */

  Array.prototype.forEach.call(document.querySelectorAll('.game--soon'), function (card) {
    card.addEventListener('click', function () {
      var btn = card.querySelector('.btn[disabled]');
      if (!btn || btn.getAttribute('data-busy') === '1') return;
      var original = btn.textContent;
      btn.setAttribute('data-busy', '1');
      btn.textContent = 'Still in development';
      window.setTimeout(function () {
        btn.textContent = original;
        btn.setAttribute('data-busy', '0');
      }, 1600);
    });
  });

  /* ==========================================================
     4. STRIPE RETURN CONFIRMATION
     Payment Link success URLs send players back to
     ?thankyou=true (?tipped=true is accepted too). Show the
     toast, then scrub the param so a reload does not replay it.

     Note: this parameter is client-side only and proves nothing.
     It is a courtesy message, never a gate on anything of value.
     ========================================================== */

  var toast = document.getElementById('thankyou-toast');

  function showToast() { if (toast) toast.classList.add('is-visible'); }
  function hideToast() { if (toast) toast.classList.remove('is-visible'); }

  (function handleTipReturn() {
    if (!toast) return;

    var search = window.location.search || '';
    var settled = false;

    if (typeof window.URLSearchParams === 'function') {
      var params = new window.URLSearchParams(search);
      settled = params.get('thankyou') === 'true' || params.get('tipped') === 'true';
    } else {
      settled = /[?&](?:thankyou|tipped)=true(?:&|$)/.test(search);
    }

    if (!settled) return;

    showToast();

    if (window.history && typeof window.history.replaceState === 'function') {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }());

  bindAll('[data-thankyou-dismiss]', hideToast);

  /* ==========================================================
     5. SERVICE WORKER REGISTRATION STUB
     Registers ./sw.js when one has been deployed, so the hub is
     installable and shells the cabinets offline. Fails silently
     on file:// and before any worker exists.
     ========================================================== */

  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js', { scope: './' })
        .then(function (reg) {
          if (window.console && console.info) {
            console.info('[Arcade] Service worker registered:', reg.scope);
          }
        })
        .catch(function () {
          /* No sw.js deployed yet — the site still runs fine online. */
        });
    });
  }

  /* ==========================================================
     6. INSTALL PROMPT CAPTURE (progressive enhancement)
     ========================================================== */

  /* ==========================================================
     7. FLOOR CAROUSEL CONTROLLER
     Smooth scroll-snap with left/right buttons & indicator.
     ========================================================== */

  var floorTrack = document.getElementById('floor-carousel');
  var floorPrev = document.querySelector('[data-carousel-prev]');
  var floorNext = document.querySelector('[data-carousel-next]');
  var floorCount = document.querySelector('[data-carousel-count]');

  if (floorTrack) {
    var floorCards = floorTrack.querySelectorAll('.cab-card');
    var floorTotal = floorCards.length;

    function updateFloorCarousel() {
      var scrollLeft = floorTrack.scrollLeft;
      var maxScroll = floorTrack.scrollWidth - floorTrack.clientWidth;
      if (floorPrev) floorPrev.disabled = scrollLeft <= 8;
      if (floorNext) floorNext.disabled = scrollLeft >= maxScroll - 8;

      var cardW = floorCards[0] ? floorCards[0].offsetWidth + 18 : 298;
      var currentIdx = Math.min(Math.round(scrollLeft / cardW) + 1, floorTotal);
      if (floorCount) {
        floorCount.textContent = (currentIdx < 10 ? '0' + currentIdx : currentIdx) + ' / ' + (floorTotal < 10 ? '0' + floorTotal : floorTotal);
      }
    }

    if (floorPrev) {
      floorPrev.addEventListener('click', function () {
        var step = floorCards[0] ? floorCards[0].offsetWidth + 18 : 298;
        floorTrack.scrollBy({ left: -step, behavior: 'smooth' });
      });
    }

    if (floorNext) {
      floorNext.addEventListener('click', function () {
        var step = floorCards[0] ? floorCards[0].offsetWidth + 18 : 298;
        floorTrack.scrollBy({ left: step, behavior: 'smooth' });
      });
    }

    floorTrack.addEventListener('scroll', updateFloorCarousel, { passive: true });
    window.addEventListener('resize', updateFloorCarousel);
    updateFloorCarousel();
  }

/* ==========================================================
   8. GAMES PAGE — filter chips
   Only the games page has these elements; on every other page
   the queries come back empty and this block does nothing.
   ========================================================== */

/* ==========================================================
         1. FILTER CHIPS — All / Live / In development
         Counts fill themselves in from the cards on the page, so
         adding a new <article class="game" data-status="..."> is the
         only thing a future edit ever has to do.
         ========================================================== */

      var grid = document.getElementById('games-grid');
      var cards = grid ? Array.prototype.slice.call(grid.querySelectorAll('.game')) : [];
      var chips = Array.prototype.slice.call(document.querySelectorAll('.filterchip'));

      function countFor(filter) {
        if (filter === 'all') return cards.length;
        var n = 0;
        for (var i = 0; i < cards.length; i++) {
          if (cards[i].getAttribute('data-status') === filter) n++;
        }
        return n;
      }

      Array.prototype.forEach.call(document.querySelectorAll('[data-count]'), function (el) {
        el.textContent = countFor(el.getAttribute('data-count'));
      });

      function applyFilter(filter) {
        cards.forEach(function (card) {
          var show = filter === 'all' || card.getAttribute('data-status') === filter;
          card.hidden = !show;
        });
        chips.forEach(function (chip) {
          chip.classList.toggle('is-active', chip.getAttribute('data-filter') === filter);
        });
      }

      chips.forEach(function (chip) {
        chip.addEventListener('click', function () {
          applyFilter(chip.getAttribute('data-filter'));
        });
      });

}());
