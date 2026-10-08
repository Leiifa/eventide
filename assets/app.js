/* ============================================================
   Eventide — app logic
   Reads window.GACHA_DATA (generated from data/raw/*.json by
   scripts/build_data.py) and renders Events / Timeline / Radar.
   ============================================================ */

(() => {
  'use strict';

  const DATA = window.GACHA_DATA || { generatedAt: null, games: [], events: [] };
  const GAMES = DATA.games || [];
  const EVENTS = DATA.events || [];
  const GAME_BY_ID = Object.fromEntries(GAMES.map(g => [g.id, g]));

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  /* ---------------- date helpers (UTC, day-level only) ---------------- */

  function parseISO(iso) {
    if (!iso || typeof iso !== 'string') return null;
    const m = iso.trim().match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
    if (!m) return null;
    return { y: +m[1], mo: +m[2], d: m[3] ? +m[3] : null };
  }

  const dayMs = 86400000;
  const today = (() => {
    const n = new Date();
    return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()));
  })();

  function evStart(ev) {
    const p = parseISO(ev.start);
    return p ? new Date(Date.UTC(p.y, p.mo - 1, p.d || 1)) : null;
  }
  function evEnd(ev) {
    const p = parseISO(ev.end);
    if (!p) return null;
    return new Date(Date.UTC(p.y, p.mo - 1, p.d || daysInMonth(p.y, p.mo)));
  }
  function daysInMonth(y, mo) {
    return new Date(Date.UTC(y, mo, 0)).getUTCDate();
  }
  function dayDiff(a, b) {
    return Math.round((a.getTime() - b.getTime()) / dayMs);
  }

  function fmtDate(iso) {
    const p = parseISO(iso);
    if (!p) return 'TBA';
    return p.d === null
      ? `${MONTHS[p.mo - 1]} ${p.y}`
      : `${p.d} ${MONTHS[p.mo - 1]} ${p.y}`;
  }

  function fmtRange(startIso, endIso) {
    const s = parseISO(startIso);
    const e = parseISO(endIso);
    if (!s && !e) return 'Dates TBA';
    if (!e) return `from ${fmtDate(startIso)}`;
    if (!s) return `until ${fmtDate(endIso)}`;
    if (s.y === e.y && s.mo === e.mo) {
      if (s.d !== null && e.d !== null) {
        return `${s.d} – ${e.d} ${MONTHS[s.mo - 1]} ${s.y}`;
      }
      return `${MONTHS[s.mo - 1]} ${s.y}`;
    }
    if (s.y === e.y) {
      return `${s.d !== null ? s.d + ' ' : ''}${MONTHS[s.mo - 1]} – ${e.d !== null ? e.d + ' ' : ''}${MONTHS[e.mo - 1]} ${s.y}`;
    }
    return `${fmtDate(startIso)} – ${fmtDate(endIso)}`;
  }

  function statusOf(ev) {
    const s = evStart(ev);
    const e = evEnd(ev);
    if (!s || !e || ev.datesPrecision === 'approx') {
      return ['live', 'upcoming', 'ended'].includes(ev.status) ? ev.status : 'upcoming';
    }
    if (today < s) return 'upcoming';
    if (today > e) return 'ended';
    return 'live';
  }

  function countdownText(ev) {
    const st = statusOf(ev);
    const s = evStart(ev);
    const e = evEnd(ev);
    if (st === 'upcoming' && s) {
      const d = dayDiff(s, today);
      if (d <= 0) return { text: 'Starts today', cls: 'is-now' };
      return { text: `Starts in ${d} day${d === 1 ? '' : 's'}`, cls: d <= 7 ? 'is-soon' : '' };
    }
    if (st === 'live' && e) {
      const d = dayDiff(e, today);
      if (d <= 0) return { text: 'Ends today', cls: 'is-soon' };
      return { text: `Ends in ${d} day${d === 1 ? '' : 's'}`, cls: d <= 3 ? 'is-soon' : '' };
    }
    if (st === 'ended' && e) {
      const d = dayDiff(today, e);
      return { text: d === 0 ? 'Ended today' : `Ended ${d} day${d === 1 ? '' : 's'} ago`, cls: '' };
    }
    return { text: 'Dates TBA', cls: '' };
  }

  /* ---------------- state ---------------- */

  const store = {
    get(k, fallback) {
      try {
        const v = localStorage.getItem('eventide.' + k);
        return v === null ? fallback : JSON.parse(v);
      } catch (_) { return fallback; }
    },
    set(k, v) {
      try { localStorage.setItem('eventide.' + k, JSON.stringify(v)); } catch (_) {}
    }
  };

  let currentView = null;

  const state = {
    games: new Set(store.get('games', GAMES.map(g => g.id))),
    status: store.get('status', 'all'),
    type: store.get('type', 'all'),
    sort: store.get('sort', 'start-asc'),
    query: store.get('query', ''),
    server: store.get('server', 'all'),
    gameId: store.get('gameId', null),
    view: store.get('view', 'home')
  };

  /* ---------------- filtering ---------------- */

  function serverOk(ev) {
    if (state.server === 'all') return true;
    const list = (ev.servers || []).map(s => String(s).toLowerCase());
    if (!list.length) return true;
    if (list.includes('global') || list.includes('all')) return true;
    return list.includes(state.server);
  }

  function queryOk(ev) {
    if (!state.query) return true;
    const q = state.query.toLowerCase();
    const hay = [
      ev.title, ev.summary, ev.description, ev.gameplay, ev.type, ev.version,
      (ev.rewardsSummary || ''),
      ...(ev.requirements || []),
      ...(ev.rewards || []).map(r => r.item)
    ].join(' ').toLowerCase();
    return hay.includes(q);
  }

  function filteredEvents(opts = {}) {
    let list = EVENTS.filter(ev => {
      if (!state.games.has(ev.game)) return false;
      if (!serverOk(ev)) return false;
      if (!queryOk(ev)) return false;
      if (!opts.ignoreStatus && state.status !== 'all' && statusOf(ev) !== state.status) return false;
      if (!opts.ignoreType && state.type !== 'all' && ev.type !== state.type) return false;
      return true;
    });

    const dir = { 'start-asc': 1, 'start-desc': -1, 'end-asc': 1, 'game': 1 }[state.sort] || 1;
    list.sort((a, b) => {
      if (state.sort === 'game') {
        const g = gameOrder(a.game) - gameOrder(b.game);
        if (g !== 0) return g;
        return (evStart(a) || 0) - (evStart(b) || 0);
      }
      const ka = state.sort === 'end-asc' ? (evEnd(a) || evStart(a)) : evStart(a);
      const kb = state.sort === 'end-asc' ? (evEnd(b) || evStart(b)) : evStart(b);
      if (!ka && !kb) return 0;
      if (!ka) return 1;
      if (!kb) return -1;
      return (ka - kb) * dir;
    });
    return list;
  }

  function gameOrder(id) {
    const i = GAMES.findIndex(g => g.id === id);
    return i === -1 ? 99 : i;
  }

  /* ---------------- small render helpers ---------------- */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function gameName(id) {
    const g = GAME_BY_ID[id];
    return g ? (g.shortName || g.name) : id;
  }
  function gameColor(id) {
    const g = GAME_BY_ID[id];
    return (g && g.accent) || '#888';
  }

  function statusPill(ev) {
    const st = statusOf(ev);
    const conf = ev.confidence || 'confirmed';
    if (conf === 'rumor' || conf === 'leaked') {
      return `<span class="pill pill-rumor">${conf === 'leaked' ? 'Leak' : 'Rumor'}</span>`;
    }
    return `<span class="pill pill-${st}">${st === 'live' ? 'Live' : st === 'upcoming' ? 'Upcoming' : 'Ended'}</span>`;
  }

  function rewardChips(ev, max = 3) {
    const rewards = ev.rewards || [];
    if (!rewards.length) {
      return ev.rewardsSummary
        ? `<span class="rw-chip">${esc(ev.rewardsSummary)}</span>`
        : `<span class="rw-more">rewards TBA</span>`;
    }
    const shown = rewards.slice(0, max).map(r => {
      const premium = r.category === 'currency' || r.category === 'gacha';
      const rare = isRareReward(ev.game, r.item);
      const amt = (r.amount === null || r.amount === undefined) ? '' :
        (r.amount >= 1000 ? ' ×' + r.amount.toLocaleString('en-US') : ' ×' + r.amount);
      return `<span class="rw-chip${premium ? ' is-premium' : ''}${rare ? ' is-rare' : ''}"${rare ? ` style="--glow:${esc(gameColor(ev.game))}"` : ''}>${rewardIconHtml(ev.game, r.item, 'cur-icon-micro')}<span class="rw-text">${esc(r.item)}${amt}</span></span>`;
    }).join('');
    const more = rewards.length > max ? `<span class="rw-more">+${rewards.length - max} more</span>` : '';
    return shown + more;
  }

  function starsHtml(rarity) {
    if (!rarity) return '<span class="stars">—</span>';
    return `<span class="stars">${'★'.repeat(Math.min(5, rarity))}</span>`;
  }

  /* ---------------- header / chrome ---------------- */

  function renderChrome() {
    document.getElementById('todayDate').textContent =
      `${today.getUTCDate()} ${MONTHS[today.getUTCMonth()]} ${today.getUTCFullYear()}`;

    const stamp = DATA.generatedAt
      ? new Date(DATA.generatedAt)
      : null;
    document.getElementById('dataStamp').textContent = stamp && !isNaN(stamp)
      ? `Data as of ${stamp.getUTCDate()} ${MONTHS[stamp.getUTCMonth()]} ${stamp.getUTCFullYear()}`
      : 'No dataset loaded yet';

    // game chips
    const wrap = document.getElementById('gameChips');
    wrap.innerHTML = GAMES.map(g => `
      <button class="chip" data-game="${esc(g.id)}" style="--chip-color:${esc(g.accent || '#888')}"
              aria-pressed="${state.games.has(g.id)}" title="${esc(g.name)}${g.currentVersion ? ' — patch ' + esc(g.currentVersion) : ''}">
        ${gameIconHtml(g, 'gicon gicon-xs')}${esc(g.shortName || g.name)}
      </button>`).join('');

    // type select
    const types = [...new Set(EVENTS.map(e => e.type).filter(Boolean))].sort();
    const typeSel = document.getElementById('typeSelect');
    typeSel.innerHTML = `<option value="all">All types</option>` +
      types.map(t => `<option value="${esc(t)}"${state.type === t ? ' selected' : ''}>${esc(t)}</option>`).join('');

    document.getElementById('serverSelect').value = state.server;
    document.getElementById('sortSelect').value = state.sort;
    document.getElementById('searchInput').value = state.query;

    document.querySelectorAll('#statusSeg .seg-btn').forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.status === state.status));
    });
    document.querySelectorAll('.nav-btn').forEach(b => {
      const activeView = state.view === 'game' ? 'games' : state.view;
      if (b.dataset.view === activeView) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    document.getElementById('statusSeg').style.display = state.view === 'events' ? '' : 'none';
    document.getElementById('typeSelect').style.display = state.view === 'events' ? '' : 'none';
    document.getElementById('sortSelect').style.display = state.view === 'events' ? '' : 'none';
    document.querySelector('.filterbar').style.display =
      (state.view === 'home' || state.view === 'games' || state.view === 'game') ? 'none' : '';
  }

  /* ---------------- events view ---------------- */

  function renderStrip() {
    const all = EVENTS.filter(ev => state.games.has(ev.game) && serverOk(ev));
    const live = all.filter(ev => statusOf(ev) === 'live').length;
    const soon = all.filter(ev => {
      const st = statusOf(ev);
      if (st === 'upcoming') {
        const s = evStart(ev);
        return s && dayDiff(s, today) <= 14;
      }
      return false;
    }).length;
    const rumors = all.filter(ev => (ev.confidence || 'confirmed') !== 'confirmed').length;

    const next = all
      .filter(ev => statusOf(ev) === 'upcoming' && evStart(ev))
      .sort((a, b) => evStart(a) - evStart(b))[0];

    const strip = document.getElementById('statusStrip');
    strip.innerHTML = `
      <div class="strip-item is-live"><span class="strip-num">${live}</span> live now</div>
      <div class="strip-item is-upcoming"><span class="strip-num">${soon}</span> starting ≤14 days</div>
      <div class="strip-item is-rumor"><span class="strip-num">${rumors}</span> rumors / leaks</div>
      <div class="strip-item"><span class="strip-num">${all.length}</span> events on the board</div>
      ${next ? `<div class="strip-next">Next up: <b>${esc(next.title)}</b> · ${esc(fmtDate(next.start))} · ${esc(gameName(next.game))}</div>` : ''}
    `;
  }

  function renderEvents() {
    renderStrip();
    const list = filteredEvents();
    const el = document.getElementById('eventList');
    const empty = document.getElementById('eventsEmpty');

    if (!EVENTS.length) {
      el.innerHTML = '';
      empty.hidden = false;
      empty.innerHTML = `No event data loaded. Fill <code>data/raw/*.json</code>, then run <code>python scripts/build_data.py</code>.`;
      return;
    }
    if (!list.length) {
      el.innerHTML = '';
      empty.hidden = false;
      empty.innerHTML = `Nothing matches these filters. Try clearing the search or status filter.`;
      return;
    }
    empty.hidden = true;
    el.innerHTML = list.map((ev, i) => {
      const cd = countdownText(ev);
      return `
      <button class="row" data-event="${esc(ev.id)}" style="--i:${Math.min(i, 14)}">
        <span class="row-game">${gameIconHtml(GAME_BY_ID[ev.game], 'gicon gicon-xs')}${esc(gameName(ev.game))}</span>
        <span class="row-main">
          <span class="row-title">${esc(ev.title)}</span>
          <span class="row-meta">
            <span>${esc(ev.type || 'Event')}</span>
            ${ev.version ? `<span class="ver">${esc(ev.version)}</span>` : ''}
            ${(ev.confidence && ev.confidence !== 'confirmed') ? `<span class="ver" style="color:var(--rumor)">${esc(ev.confidence)}</span>` : ''}
          </span>
        </span>
        <span class="row-dates">
          <span class="row-date-main">${esc(fmtRange(ev.start, ev.end))}</span>
          <span class="row-count ${cd.cls}">${esc(cd.text)}</span>
        </span>
        <span class="row-rewards">${rewardChips(ev)}</span>
        <span class="row-status">${statusPill(ev)}</span>
      </button>`;
    }).join('');
  }

  /* ---------------- timeline view ---------------- */

  /* ---------------- timeline view ---------------- */

  const TL_PX_PER_DAY = 24; // keep in sync with --tl-day in styles.css

  function renderTimeline() {
    const list = filteredEvents({ ignoreStatus: true, ignoreType: true });
    const legend = document.getElementById('timelineLegend');
    const host = document.getElementById('timeline');
    const empty = document.getElementById('timelineEmpty');

    const fresh = currentView !== 'timeline';
    const oldScroll = host.querySelector('.tl-scroll');
    const prevScrollLeft = oldScroll ? oldScroll.scrollLeft : null;

    const dated = list.filter(ev => evStart(ev) || evEnd(ev));
    const undated = list.filter(ev => !evStart(ev) && !evEnd(ev));

    legend.innerHTML =
      GAMES.filter(g => state.games.has(g.id)).map(g => `
        <span class="legend-item"><span class="legend-swatch" style="background:${esc(g.accent || '#888')}"></span>${esc(g.shortName || g.name)}</span>`).join('') +
      `<span class="legend-item"><span class="legend-line"></span>today</span>` +
      `<span class="legend-item"><span class="legend-swatch" style="background:repeating-linear-gradient(45deg,var(--rumor),var(--rumor) 3px,rgba(245,181,68,.5) 3px,rgba(245,181,68,.5) 6px)"></span>rumor / leak</span>` +
      `<span class="legend-item tl-hint">scroll sideways — past months sit to the left</span>` +
      `<button class="btn btn-tiny tl-jump" id="tlToday">Today</button>`;

    const undatedPanel = undated.length ? `
      <section class="home-panel" style="margin-top:16px">
        <div class="home-panel-head">
          <h2 class="home-h2">Dates TBA</h2>
          <span class="home-hint">${undated.length} event${undated.length === 1 ? '' : 's'} without dates yet</span>
        </div>
        ${undated.map((ev, i) => homeRow(ev, i)).join('')}
      </section>` : '';

    if (!dated.length) {
      host.innerHTML = undatedPanel;
      empty.hidden = !!undated.length;
      if (!undated.length) empty.innerHTML = `No dated events match these filters.`;
      return;
    }
    empty.hidden = true;

    // one continuous, month-aligned range that always contains today
    let minStart = null;
    let maxEnd = null;
    dated.forEach(ev => {
      const s = evStart(ev) || evEnd(ev);
      const e = evEnd(ev) || evStart(ev);
      if (!minStart || s < minStart) minStart = s;
      if (!maxEnd || e > maxEnd) maxEnd = e;
    });
    if (today < minStart) minStart = today;
    if (today > maxEnd) maxEnd = today;

    const rangeStart = new Date(Date.UTC(minStart.getUTCFullYear(), minStart.getUTCMonth(), 1));
    const rangeEnd = new Date(Date.UTC(maxEnd.getUTCFullYear(), maxEnd.getUTCMonth() + 1, 0));
    const totalDays = dayDiff(rangeEnd, rangeStart) + 1;
    const trackW = totalDays * TL_PX_PER_DAY;

    const months = [];
    let my = rangeStart.getUTCFullYear();
    let mm = rangeStart.getUTCMonth() + 1;
    while (my < rangeEnd.getUTCFullYear() ||
           (my === rangeEnd.getUTCFullYear() && mm <= rangeEnd.getUTCMonth() + 1)) {
      const first = new Date(Date.UTC(my, mm - 1, 1));
      months.push({ y: my, m: mm, off: dayDiff(first, rangeStart), dim: daysInMonth(my, mm) });
      mm++;
      if (mm > 12) { mm = 1; my++; }
    }

    const axisHtml = months.map(mo => {
      const left = mo.off * TL_PX_PER_DAY;
      const isNow = mo.y === today.getUTCFullYear() && mo.m === today.getUTCMonth() + 1;
      const ticks = [1, 5, 10, 15, 20, 25].filter(d => d <= mo.dim)
        .map(d => `<span class="tl-tick" style="left:${left + (d - 1) * TL_PX_PER_DAY}px">${d}</span>`).join('');
      return `<div class="tl-month-seg${isNow ? ' is-now' : ''}" style="left:${left}px;width:${mo.dim * TL_PX_PER_DAY}px">
                <span class="tl-month-name">${MONTHS_FULL[mo.m - 1]} ${mo.y}</span>
              </div>${ticks}`;
    }).join('');

    const mlines = months.map(mo =>
      `<span class="tl-mline" style="left:${mo.off * TL_PX_PER_DAY}px"></span>`).join('');

    const rowsHtml = dated
      .slice()
      .sort((a, b) => {
        const g = gameOrder(a.game) - gameOrder(b.game);
        if (g !== 0) return g;
        return (evStart(a) || 0) - (evStart(b) || 0);
      })
      .map((ev, i) => {
        const s = evStart(ev) || evEnd(ev);
        const e = evEnd(ev) || evStart(ev);
        const left = dayDiff(s, rangeStart) * TL_PX_PER_DAY;
        const w = Math.max((dayDiff(e, s) + 1) * TL_PX_PER_DAY, 10);
        const st = statusOf(ev);
        const isRumor = (ev.confidence || 'confirmed') !== 'confirmed';
        const cls = ['bar', isRumor ? 'is-rumor' : '', st === 'ended' ? 'is-ended' : ''].filter(Boolean).join(' ');
        const color = isRumor ? '' : `background:${esc(gameColor(ev.game))};`;
        const label = w > 150 ? esc(ev.title) : '';
        return `
          <div class="tl-row">
            <button class="tl-label" data-event="${esc(ev.id)}">
              <span class="tl-title">${esc(ev.title)}</span>
              <span class="tl-game">${gameIconHtml(GAME_BY_ID[ev.game], 'gicon gicon-xs')}${esc(gameName(ev.game))}</span>
            </button>
            <div class="tl-track" style="width:${trackW}px">
              <button class="${cls}" style="left:${left}px;width:${w}px;--i:${Math.min(i, 20)};${color}"
                      data-event="${esc(ev.id)}" title="${esc(ev.title)} — ${esc(fmtRange(ev.start, ev.end))}">${label}</button>
            </div>
          </div>`;
      }).join('');

    const todayX = dayDiff(today, rangeStart) * TL_PX_PER_DAY;

    host.innerHTML = `
      <div class="tl-scroll" id="tlScroll" data-today-x="${todayX}">
        <div class="tl-inner" style="width:calc(var(--tl-label-w) + ${trackW}px)">
          <div class="tl-head">
            <div class="tl-corner">Event</div>
            <div class="tl-axis" style="width:${trackW}px">
              ${axisHtml}
              <span class="tl-today-tag" style="left:${todayX}px">today</span>
            </div>
          </div>
          <div class="tl-body">
            <div class="tl-grid" style="width:${trackW}px">${mlines}</div>
            ${rowsHtml}
            <div class="tl-today" style="left:calc(var(--tl-label-w) + ${todayX}px)"></div>
          </div>
        </div>
      </div>
      ${undatedPanel}`;

    const scroller = document.getElementById('tlScroll');
    if (scroller) {
      const target = (prevScrollLeft === null || fresh) ? Math.max(0, todayX - 220) : prevScrollLeft;
      scroller.scrollLeft = target;
    }
  }

  /* ---------------- radar view ---------------- */

  function renderRadar() {
    const host = document.getElementById('radar');
    const empty = document.getElementById('radarEmpty');
    const pool = EVENTS.filter(ev => state.games.has(ev.game) && serverOk(ev) && queryOk(ev));

    const confirmed = pool.filter(ev => statusOf(ev) === 'upcoming' && (ev.confidence || 'confirmed') === 'confirmed')
      .sort((a, b) => (evStart(a) || 0) - (evStart(b) || 0));
    const rumors = pool.filter(ev => (ev.confidence || 'confirmed') !== 'confirmed')
      .sort((a, b) => (evStart(a) || 0) - (evStart(b) || 0));

    if (!confirmed.length && !rumors.length) {
      host.innerHTML = '';
      empty.hidden = false;
      empty.innerHTML = `No upcoming events or rumors in the current dataset.`;
      return;
    }
    empty.hidden = true;

    host.innerHTML = `
      <section class="radar-sec">
        <div class="radar-head">
          <span class="radar-title">On the calendar</span>
          <span class="radar-sub">announced with real dates — ${confirmed.length} event${confirmed.length === 1 ? '' : 's'}</span>
        </div>
        <div class="radar-grid">
          ${confirmed.length ? confirmed.map(radarCard).join('') : '<div class="empty" style="grid-column:1/-1">Nothing announced yet in this filter.</div>'}
        </div>
      </section>
      <section class="radar-sec">
        <div class="radar-head">
          <span class="radar-title">Rumors &amp; leaks</span>
          <span class="radar-sub">unconfirmed — dates and rewards may change · ${rumors.length}</span>
        </div>
        <div class="radar-grid">
          ${rumors.length ? rumors.map(radarCard).join('') : '<div class="empty" style="grid-column:1/-1">Nothing floating around right now.</div>'}
        </div>
      </section>`;
  }

  function radarCard(ev, i) {
    const conf = ev.confidence || 'confirmed';
    return `
      <button class="rcard" data-event="${esc(ev.id)}" style="--i:${Math.min(i || 0, 14)}">
        <span class="rcard-top">
          <span class="row-game">${gameIconHtml(GAME_BY_ID[ev.game], 'gicon gicon-xs')}${esc(gameName(ev.game))}</span>
          <span class="conf conf-${esc(conf)}">${esc(conf)}</span>
        </span>
        <span class="rcard-title">${esc(ev.title)}</span>
        ${ev.summary ? `<span class="rcard-summary">${esc(ev.summary)}</span>` : ''}
        ${ev.rumorNotes ? `<span class="rumor-note">${esc(ev.rumorNotes)}</span>` : ''}
        <span class="row-rewards">${rewardChips(ev, 4)}</span>
        <span class="rcard-foot">
          <span class="rcard-date">${esc(fmtRange(ev.start, ev.end))}</span>
          ${statusPill(ev)}
        </span>
      </button>`;
  }

  /* ---------------- home ---------------- */

  function headlineCurrency(gameId) {
    const list = (GAME_BY_ID[gameId] && GAME_BY_ID[gameId].currencies) || [];
    return list.length && list[0].name ? list[0].name : null;
  }

  function premiumTotal(ev) {
    const name = headlineCurrency(ev.game);
    if (!name) return 0;
    const n = String(name).toLowerCase().trim();
    return (ev.rewards || []).reduce((sum, r) => {
      const item = String(r.item || '').toLowerCase().trim();
      return sum + ((item === n || item.startsWith(n)) && typeof r.amount === 'number' ? r.amount : 0);
    }, 0);
  }

  function topRewardLabel(ev) {
    const r = (ev.rewards || [])[0];
    if (!r) return ev.rewardsSummary ? ev.rewardsSummary.slice(0, 42) : 'rewards TBA';
    return r.item + (typeof r.amount === 'number' ? ' ×' + r.amount.toLocaleString('en-US') : '');
  }

  function homeRow(ev, i) {
    return `
      <button class="home-row" data-event="${esc(ev.id)}" style="--i:${Math.min(i || 0, 14)}">
        ${gameIconHtml(GAME_BY_ID[ev.game], 'gicon gicon-xs')}
        <span class="home-row-main">
          <span class="home-row-top">
            <span class="home-row-title">${esc(ev.title)}</span>
            ${statusPill(ev)}
          </span>
          <span class="home-row-sub">
            <span class="home-row-meta"><span class="meta-game">${esc(gameName(ev.game))}</span><span class="meta-sep">·</span><span class="meta-dates">${esc(fmtRange(ev.start, ev.end))}</span></span>
            ${rewardChipHtml(ev)}
          </span>
        </span>
      </button>`;
  }

  function payoutRow(ev, total, i) {
    const unit = headlineCurrency(ev.game) || 'premium currency';
    return `
      <button class="payout-row" data-event="${esc(ev.id)}" style="--i:${Math.min(i || 0, 14)};--glow:${esc(gameColor(ev.game))}">
        <span class="payout-prize">
          <span class="payout-amount is-rare">${total.toLocaleString('en-US')}</span>
          <span class="payout-unit">${rewardIconHtml(ev.game, unit, 'cur-icon-micro')}${esc(unit)}</span>
        </span>
        <span class="payout-main">
          <span class="home-row-top">
            <span class="home-row-title">${esc(ev.title)}</span>
            ${statusPill(ev)}
          </span>
          <span class="home-row-sub">
            <span class="home-row-meta"><span class="meta-game">${esc(gameName(ev.game))}</span><span class="meta-sep">·</span><span class="meta-dates">${esc(fmtRange(ev.start, ev.end))}</span></span>
          </span>
        </span>
      </button>`;
  }

  function renderHome() {
    const host = document.getElementById('home');
    const all = EVENTS.filter(ev => serverOk(ev));
    const live = all.filter(e => statusOf(e) === 'live');
    const upcoming = all.filter(e => statusOf(e) === 'upcoming').sort((a, b) => (evStart(a) || 0) - (evStart(b) || 0));
    const rumors = all.filter(e => (e.confidence || 'confirmed') !== 'confirmed');

    const endingSoon = live
      .filter(e => evEnd(e) && dayDiff(evEnd(e), today) >= 0 && dayDiff(evEnd(e), today) <= 7)
      .sort((a, b) => evEnd(a) - evEnd(b)).slice(0, 5);
    const startingSoon = upcoming
      .filter(e => evStart(e) && dayDiff(evStart(e), today) <= 14).slice(0, 5);
    const nextUp = upcoming.find(e => evStart(e));
    const payouts = all
      .filter(e => statusOf(e) !== 'ended')
      .map(e => ({ ev: e, total: premiumTotal(e) }))
      .filter(x => x.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 4);
    const stamp = DATA.generatedAt ? String(DATA.generatedAt).slice(0, 10) : '';

    host.innerHTML = `
      <div class="home-hero">
        <div class="home-hero-text">
          <div class="home-kicker">${GAMES.length} games · ${EVENTS.length} events tracked${stamp ? ' · updated ' + esc(fmtDate(stamp)) : ''}</div>
          <h1 class="home-title">Every event, every game.<br>One calendar.</h1>
          <p class="home-sub">Stop juggling wikis and launchers. Eventide puts every game you play on
            one board — rewards up front, dates down to the day, and rumors labeled as rumors. New games are on the way.</p>
          <div class="home-cta">
            <button class="btn btn-primary" data-goto="games">Browse games</button>
            <button class="btn" data-goto="events">See what's live</button>
            <button class="btn" data-goto="timeline">Open the timeline</button>
          </div>
        </div>

        <div class="home-board">
          <div class="hb-title">
            <div class="hb-head">Right now</div>
            <div class="hb-scope">
              <span class="hb-scope-icons">${GAMES.map(g => gameIconHtml(g, 'gicon gicon-micro')).join('')}</span>
              <span>home shows <b>every game on the tracker</b> — filters apply on other tabs</span>
            </div>
          </div>
          <div class="hb-grid">
            <div class="hb-cell"><b>${live.length}</b><span>live</span></div>
            <div class="hb-cell"><b>${upcoming.length}</b><span>upcoming</span></div>
            <div class="hb-cell"><b>${rumors.length}</b><span>rumors</span></div>
            <div class="hb-cell"><b>${all.length}</b><span>tracked</span></div>
          </div>
          ${nextUp ? `
            <div class="hb-next">
              <div class="kv-label">Next up</div>
              <button class="hb-next-row" data-event="${esc(nextUp.id)}">
                ${gameIconHtml(GAME_BY_ID[nextUp.game], 'gicon gicon-xs')}
                <span class="hb-next-title">${esc(nextUp.title)}</span>
                ${rewardChipHtml(nextUp)}
                <span class="hb-next-date">${esc(fmtDate(nextUp.start))}</span>
              </button>
            </div>` : ''}
        </div>
      </div>

      <section class="home-panel payout-panel">
        <div class="home-panel-head">
          <h2 class="home-h2">Biggest pull-currency payouts</h2>
          <span class="home-hint">rare currency only · biggest first · live + upcoming</span>
        </div>
        ${payouts.length ? payouts.map((x, i) => payoutRow(x.ev, x.total, i)).join('') : '<div class="empty">No currency rewards published right now.</div>'}
      </section>

      <div class="home-cols">
        <section class="home-panel">
          <div class="home-panel-head">
            <h2 class="home-h2">Starting soon</h2>
            <button class="btn btn-tiny" data-goto="events">all events</button>
          </div>
          ${startingSoon.length ? startingSoon.map(homeRow).join('') : '<div class="empty">Nothing lands in the next two weeks.</div>'}
        </section>

        <section class="home-panel">
          <div class="home-panel-head">
            <h2 class="home-h2">Ending soon</h2>
            <span class="home-hint">don't leave rewards on the table</span>
          </div>
          ${endingSoon.length ? endingSoon.map(homeRow).join('') : '<div class="empty">Nothing expires this week.</div>'}
        </section>
      </div>

      <section class="home-panel">
        <div class="home-panel-head">
          <h2 class="home-h2">Games on this tracker</h2>
          <button class="btn btn-tiny" data-goto="games">game pages</button>
        </div>
        <div class="home-games">
          ${GAMES.map((g, i) => {
            const evs = EVENTS.filter(e => e.game === g.id);
            const gLive = evs.filter(e => statusOf(e) === 'live').length;
            return `
              <button class="mini-game" data-game-detail="${esc(g.id)}" style="--i:${i}">
                ${gameIconHtml(g, 'gicon')}
                <span class="mini-game-text">
                  <b>${esc(g.shortName || g.name)}</b>
                  <small>${esc(g.currentVersion ? 'patch ' + g.currentVersion : (g.genre || ''))}</small>
                </span>
                <span class="mini-game-live"><b>${gLive}</b> live</span>
              </button>`;
          }).join('')}
        </div>
      </section>

      ${rumors.length ? `
        <section class="home-radar">
          <span class="home-radar-text"><b>${rumors.length} rumor${rumors.length === 1 ? '' : 's'}</b> floating around —
            unconfirmed dates and rewards, kept off the schedule on purpose.</span>
          <button class="btn btn-tiny" data-goto="radar">Open the radar</button>
        </section>` : ''}
    `;
  }

  /* ---------------- currency icons ---------------- */

  function currencyFor(gameId, itemName) {
    const list = (GAME_BY_ID[gameId] && GAME_BY_ID[gameId].currencies) || [];
    const n = String(itemName || '').toLowerCase().trim();
    if (!n) return null;
    return list.find(c => String(c.name || '').toLowerCase().trim() === n)
      || list.find(c => {
        const cn = String(c.name || '').toLowerCase().trim();
        return cn.length > 2 && (n.startsWith(cn) || cn.startsWith(n));
      })
      || null;
  }

  function rewardIconHtml(gameId, itemName, iconClass) {
    const cur = currencyFor(gameId, itemName);
    if (!cur) return '';
    return `
      <span class="cur-icon ${iconClass || 'cur-icon-sm'}">
        <span class="cur-letter" style="background:${esc(gameColor(gameId))}">${esc((cur.name || '?').charAt(0))}</span>
        ${imgTag(cur.icon, cur.name, 'icon-img')}
      </span>`;
  }

  function isRareReward(gameId, itemName) {
    const name = headlineCurrency(gameId);
    if (!name) return false;
    const n = String(name).toLowerCase().trim();
    const it = String(itemName || '').toLowerCase().trim();
    return !!it && (it === n || it.startsWith(n));
  }

  function rewardChipHtml(ev) {
    const r = (ev.rewards || [])[0];
    const cat = String(r && r.category || '').toLowerCase();
    const premium = !r || cat === 'currency' || cat === 'gacha';
    const rare = isRareReward(ev.game, r ? r.item : '');
    return `
      <span class="rw-chip${premium ? ' is-premium' : ''}${rare ? ' is-rare' : ''} home-reward"${rare ? ` style="--glow:${esc(gameColor(ev.game))}"` : ''}>
        ${rewardIconHtml(ev.game, r ? r.item : '', 'cur-icon-micro')}
        <span class="home-reward-text">${esc(topRewardLabel(ev))}</span>
      </span>`;
  }

  /* ---------------- games tab & game detail ---------------- */

  function imgTag(src, alt, cls) {
    if (!src) return '';
    return `<img class="${cls}" src="${esc(src)}" alt="${esc(alt)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'">`;
  }

  function gameIconHtml(g, cls) {
    return `
      <span class="${cls}">
        <span class="icon-letter" style="background:${esc(g.accent || '#888')}">${esc((g.shortName || g.name || '?').charAt(0))}</span>
        ${imgTag(g.icon, (g.name || '') + ' icon', 'icon-img')}
      </span>`;
  }

  function gameBannerHtml(g, cls) {
    return `
      <span class="${cls}" style="--gaccent:${esc(g.accent || '#888')}">
        <span class="banner-fallback"></span>
        ${imgTag(g.banner, (g.name || '') + ' key art', 'banner-img')}
      </span>`;
  }

  function renderGames() {
    const host = document.getElementById('gameGrid');
    if (!GAMES.length) {
      host.innerHTML = `<div class="empty">No games loaded yet.</div>`;
      return;
    }
    host.innerHTML = GAMES.map((g, i) => {
      const evs = EVENTS.filter(e => e.game === g.id);
      const live = evs.filter(e => statusOf(e) === 'live').length;
      const up = evs.filter(e => statusOf(e) === 'upcoming').length;
      return `
        <button class="game-card" data-game-detail="${esc(g.id)}" style="--i:${i}">
          <span class="game-card-banner">${gameBannerHtml(g, 'gbanner')}</span>
          <span class="game-card-body">
            <span class="game-card-icon">${gameIconHtml(g, 'gicon')}</span>
            <span class="game-card-name">${esc(g.name)}</span>
            <span class="game-card-meta">${esc(g.genre || 'Gacha game')}${g.publisher ? ' · ' + esc(g.publisher) : ''}</span>
            <span class="game-card-stats">
              <span class="gstat"><b>${live}</b> live</span>
              <span class="gstat"><b>${up}</b> upcoming</span>
              ${g.currentVersion ? `<span class="gstat ver">patch ${esc(g.currentVersion)}</span>` : ''}
            </span>
          </span>
        </button>`;
    }).join('');
  }

  function eventMiniCard(ev, i) {
    const cd = countdownText(ev);
    const banner = ev.banner
      ? `<span class="gbanner"><span class="banner-fallback"></span>${imgTag(ev.banner, ev.title, 'banner-img')}</span>`
      : `<span class="gbanner is-fallback" style="--gaccent:${esc(gameColor(ev.game))}"><span class="banner-fallback"><span class="fb-type">${esc(ev.type || 'Event')}</span></span></span>`;
    return `
      <button class="ev-card" data-event="${esc(ev.id)}" style="--i:${Math.min(i || 0, 14)}">
        <span class="ev-card-banner">${banner}</span>
        <span class="ev-card-body">
          <span class="ev-card-title">${esc(ev.title)}</span>
          <span class="ev-card-dates">${esc(fmtRange(ev.start, ev.end))}</span>
          <span class="row-rewards">${rewardChips(ev, 2)}</span>
          <span class="ev-card-foot">${statusPill(ev)}<span class="row-count ${cd.cls}">${esc(cd.text)}</span></span>
        </span>
      </button>`;
  }

  function renderGameDetail(id) {
    const g = GAME_BY_ID[id];
    const host = document.getElementById('gameDetail');
    if (!g) {
      host.innerHTML = `<button class="back-link" id="backToGames">← All games</button><div class="empty">Unknown game.</div>`;
      return;
    }

    const evs = EVENTS.filter(e => e.game === id && serverOk(e));
    const live = evs.filter(e => statusOf(e) === 'live');
    const upcoming = evs.filter(e => statusOf(e) === 'upcoming').sort((a, b) => (evStart(a) || 0) - (evStart(b) || 0));
    const ended = evs.filter(e => statusOf(e) === 'ended')
      .sort((a, b) => (evEnd(b) || 0) - (evEnd(a) || 0)).slice(0, 4);
    const currencies = g.currencies || [];
    const meta = [g.publisher, g.genre, ...(g.platforms || [])].filter(Boolean);
    const codeEv = evs.find(e => (e.codes || []).length && /redeem|code/i.test((e.type || '') + ' ' + e.title))
      || evs.find(e => (e.codes || []).length);
    // the game page has a Redeem codes button in the header — the codes card
    // itself is hidden from "Live now" here (it stays visible on Events etc.)
    const liveCards = live.filter(e => !codeEv || e.id !== codeEv.id);

    host.innerHTML = `
      <button class="back-link" id="backToGames">← All games</button>

      <div class="game-hero">${gameBannerHtml(g, 'gbanner')}</div>

      <div class="game-head">
        ${gameIconHtml(g, 'gicon gicon-lg')}
        <div class="game-head-text">
          <h1 class="game-title">${esc(g.name)}</h1>
          <div class="game-meta-row">
            ${meta.map(m => `<span class="meta-chip">${esc(m)}</span>`).join('')}
            ${g.releaseDate ? `<span class="meta-chip">Released ${esc(fmtDate(g.releaseDate))}</span>` : ''}
          </div>
        </div>
        <div class="game-actions">
          ${codeEv ? `
          <button class="redeem-btn" data-event="${esc(codeEv.id)}" title="Active redeem codes" style="--glow:${esc(gameColor(id))}">
            <svg class="gift-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3.5" y="9.5" width="17" height="11" rx="1.5"></rect>
              <path d="M2.5 9.5h19M12 9.5v11"></path>
              <path d="M12 9.5C10.8 5.9 6.6 5.1 5.6 6.9c-.9 1.7 1.6 2.9 6.4 2.6"></path>
              <path d="M12 9.5c1.2-3.6 5.4-4.4 6.4-2.6.9 1.7-1.6 2.9-6.4 2.6"></path>
            </svg>
            Redeem codes
          </button>` : ''}
          ${g.officialUrl ? `<a class="src-link game-site" href="${esc(g.officialUrl)}" target="_blank" rel="noopener noreferrer">Official site ↗</a>` : ''}
        </div>
      </div>

      <div class="game-status">
        <div class="gs-cell"><div class="kv-label">Current patch</div><div class="kv-value">${esc(g.currentVersion || '—')}</div></div>
        <div class="gs-cell"><div class="kv-label">Next update</div><div class="kv-value">${g.nextVersion ? esc(g.nextVersion) + (g.nextVersionDate ? ' · ' + esc(fmtDate(g.nextVersionDate)) : '') : 'unannounced'}</div></div>
        <div class="gs-cell"><div class="kv-label">Live now</div><div class="kv-value">${liveCards.length}</div></div>
        <div class="gs-cell"><div class="kv-label">Upcoming</div><div class="kv-value">${upcoming.length}</div></div>
        <div class="gs-cell"><div class="kv-label">Events tracked</div><div class="kv-value">${evs.length}</div></div>
      </div>

      ${g.description ? `
        <section class="game-section">
          <h2 class="drawer-h">About this game</h2>
          <p class="drawer-text">${esc(g.description)}</p>
        </section>` : ''}

      ${currencies.length ? `
        <section class="game-section">
          <h2 class="drawer-h">Reward currencies &amp; items</h2>
          <div class="currency-row">
            ${currencies.map(c => `
              <span class="currency-chip" title="${esc(c.note || '')}">
                <span class="cur-icon">
                  <span class="cur-letter" style="background:${esc(g.accent || '#888')}">${esc((c.name || '?').charAt(0))}</span>
                  ${imgTag(c.icon, c.name, 'icon-img')}
                </span>
                <span class="cur-text"><b>${esc(c.name)}</b>${c.note ? `<small>${esc(c.note)}</small>` : ''}</span>
              </span>`).join('')}
          </div>
        </section>` : ''}

      <section class="game-section">
        <h2 class="drawer-h">Live now <span class="sec-count">${liveCards.length}</span></h2>
        <div class="ev-cards">${liveCards.length ? liveCards.map(eventMiniCard).join('') : '<div class="empty">Nothing live right now.</div>'}</div>
      </section>

      <section class="game-section">
        <h2 class="drawer-h">Upcoming <span class="sec-count">${upcoming.length}</span></h2>
        <div class="ev-cards">${upcoming.length ? upcoming.map(eventMiniCard).join('') : '<div class="empty">Nothing announced yet.</div>'}</div>
      </section>

      ${ended.length ? `
        <section class="game-section">
          <h2 class="drawer-h">Recently ended</h2>
          <div class="ev-cards">${ended.map(eventMiniCard).join('')}</div>
        </section>` : ''}
    `;
  }

  /* ---------------- detail drawer ---------------- */

  function redeemCodesHtml(ev) {
    const codes = ev.codes || [];
    if (!codes.length) return '';
    const perm = codes.filter(c => c.permanent);
    const limited = codes.filter(c => !c.permanent);
    const chip = (c) => {
      const badge = c.permanent ? 'permanent'
        : c.expires ? 'expires ' + fmtDate(c.expires)
        : (c.expiryNote || 'expiry not published');
      return `
        <div class="code-chip${c.permanent ? ' is-perm' : ''}">
          <code class="code-str">${esc(c.code)}</code>
          ${c.note ? `<span class="code-note">${esc(c.note)}</span>` : ''}
          <span class="code-expiry">${esc(badge)}</span>
        </div>`;
    };
    return `
      <div class="drawer-section">
        <div class="drawer-h">Redeem codes</div>
        ${perm.length ? `
          <div class="code-group">
            <div class="code-group-head">Permanent — no expiry</div>
            <div class="code-list">${perm.map(chip).join('')}</div>
          </div>` : ''}
        ${limited.length ? `
          <div class="code-group">
            <div class="code-group-head">Time-limited</div>
            <div class="code-list">${limited.map(chip).join('')}</div>
          </div>` : ''}
      </div>`;
  }

  function openDrawer(ev) {
    const body = document.getElementById('drawerBody');
    const cd = countdownText(ev);
    const rewards = ev.rewards || [];

    body.innerHTML = `
      ${ev.banner ? `<div class="drawer-banner" data-banner="${esc(ev.banner)}" data-banner-title="${esc(ev.title)}" title="View full banner">${imgTag(ev.banner, ev.title, 'banner-img')}<span class="banner-zoom">⤢ Full banner</span></div>` : ''}
      <div class="drawer-game">
        <span class="chip-dot" style="background:${esc(gameColor(ev.game))}"></span>
        ${esc(GAME_BY_ID[ev.game] ? GAME_BY_ID[ev.game].name : ev.game)}
      </div>
      <h2 class="drawer-title" id="drawerTitle">${esc(ev.title)}</h2>
      <div class="drawer-badges">
        ${statusPill(ev)}
        <span class="pill pill-ended" style="text-transform:none;letter-spacing:0">${esc(ev.type || 'Event')}</span>
        ${ev.version ? `<span class="pill pill-ended" style="text-transform:none;letter-spacing:0;font-family:var(--font-mono)">${esc(ev.version)}</span>` : ''}
        <span class="pill pill-ended" style="text-transform:none;letter-spacing:0">${esc(cd.text)}</span>
      </div>

      <div class="drawer-dates">
        <div>
          <div class="kv-label">Starts</div>
          <div class="kv-value">${esc(fmtDate(ev.start))}</div>
        </div>
        <div>
          <div class="kv-label">Ends</div>
          <div class="kv-value">${esc(fmtDate(ev.end))}</div>
        </div>
        <div>
          <div class="kv-label">Servers</div>
          <div class="kv-value">${esc((ev.servers || ['global']).join(', '))}</div>
        </div>
      </div>

      ${ev.summary ? `<div class="drawer-section"><div class="drawer-h">What it is</div><p class="drawer-text">${esc(ev.summary)}</p></div>` : ''}
      ${ev.description ? `<div class="drawer-section"><div class="drawer-h">About</div><p class="drawer-text">${esc(ev.description)}</p></div>` : ''}
      ${ev.gameplay ? `<div class="drawer-section"><div class="drawer-h">How it plays</div><p class="drawer-text">${esc(ev.gameplay)}</p></div>` : ''}

      ${redeemCodesHtml(ev)}

      ${(ev.requirements && ev.requirements.length) ? `
        <div class="drawer-section">
          <div class="drawer-h">Requirements</div>
          <ul class="req-list">${ev.requirements.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
        </div>` : ''}

      <div class="drawer-section">
        <div class="drawer-h">Rewards</div>
        ${ev.rewardsSummary ? `<div class="reward-sum"><span class="tag">Total</span>${esc(ev.rewardsSummary)}</div>` : ''}
        ${rewards.length ? `
          <table class="reward-table">
            <thead><tr><th>Item</th><th>Amount</th><th>Rarity</th><th>Note</th></tr></thead>
            <tbody>
              ${rewards.map(r => `
                <tr>
                  <td class="item"><span class="item-wrap">${rewardIconHtml(ev.game, r.item)}<span>${esc(r.item)}</span></span></td>
                  <td class="amount">${(r.amount === null || r.amount === undefined) ? '—' : Number(r.amount).toLocaleString('en-US')}</td>
                  <td>${starsHtml(r.rarity)}</td>
                  <td class="note">${esc(r.note || r.category || '')}</td>
                </tr>`).join('')}
            </tbody>
          </table>` : (ev.rewardsSummary ? '' : '<p class="drawer-text">Reward list not published yet.</p>')}
      </div>

      ${ev.rumorNotes ? `
        <div class="drawer-section">
          <div class="drawer-h">Reliability</div>
          <p class="rumor-note">${esc(ev.rumorNotes)}</p>
        </div>` : ''}

      ${ev.sourceUrl ? `
        <div class="drawer-section">
          <div class="drawer-h">Source</div>
          <a class="src-link" href="${esc(ev.sourceUrl)}" target="_blank" rel="noopener noreferrer">
            ${esc(ev.sourceName || 'Official source')} ↗
          </a>
        </div>` : ''}
    `;

    document.getElementById('drawer').hidden = false;
    document.getElementById('drawerScrim').hidden = false;
    document.getElementById('drawerClose').focus();
  }

  function closeDrawer() {
    document.getElementById('drawer').hidden = true;
    document.getElementById('drawerScrim').hidden = true;
  }

  /* ---------------- view switching ---------------- */

  function render() {
    if (state.view === 'game' && !GAME_BY_ID[state.gameId]) state.view = 'games';
    renderChrome();
    ['home', 'events', 'timeline', 'radar', 'games', 'game'].forEach(v => {
      document.getElementById('view-' + v).hidden = v !== state.view;
    });
    if (state.view === 'home') renderHome();
    if (state.view === 'events') renderEvents();
    if (state.view === 'timeline') renderTimeline();
    if (state.view === 'radar') renderRadar();
    if (state.view === 'games') renderGames();
    if (state.view === 'game') renderGameDetail(state.gameId);
    store.set('view', state.view);
    store.set('gameId', state.gameId);
    currentView = state.view;
    updateToTop();
    updateHeader();
    updateFilterSummary();
  }

  /* ---------------- events ---------------- */

  document.addEventListener('click', (e) => {
    if (suppressClick) { suppressClick = false; return; }

    const lbClose = e.target.closest('[data-lb-close]');
    if (lbClose) {
      closeLightbox();
      return;
    }

    const bannerZone = e.target.closest('[data-banner]');
    if (bannerZone) {
      openLightbox(bannerZone.dataset.banner, bannerZone.dataset.bannerTitle || '');
      return;
    }

    const navBtn = e.target.closest('.nav-btn');
    if (navBtn) {
      state.view = navBtn.dataset.view;
      render();
      return;
    }

    const chip = e.target.closest('.chip[data-game]');
    if (chip) {
      const id = chip.dataset.game;
      if (state.games.has(id) && state.games.size > 1) state.games.delete(id);
      else state.games.add(id);
      store.set('games', [...state.games]);
      render();
      return;
    }

    const seg = e.target.closest('.seg-btn');
    if (seg) {
      state.status = seg.dataset.status;
      store.set('status', state.status);
      render();
      return;
    }

    const todayBtn = e.target.closest('#tlToday');
    if (todayBtn) {
      const scroller = document.getElementById('tlScroll');
      if (scroller) {
        const x = Number(scroller.dataset.todayX || 0);
        scroller.scrollTo({ left: Math.max(0, x - 220), behavior: reducedMotion() ? 'auto' : 'smooth' });
      }
      return;
    }

    const goto = e.target.closest('[data-goto]');
    if (goto) {
      state.view = goto.dataset.goto;
      render();
      window.scrollTo(0, 0);
      return;
    }

    const gameCard = e.target.closest('[data-game-detail]');
    if (gameCard) {
      state.gameId = gameCard.dataset.gameDetail;
      state.view = 'game';
      render();
      window.scrollTo(0, 0);
      return;
    }

    const backBtn = e.target.closest('#backToGames');
    if (backBtn) {
      state.view = 'games';
      render();
      window.scrollTo(0, 0);
      return;
    }

    const evTarget = e.target.closest('[data-event]');
    if (evTarget) {
      const ev = EVENTS.find(x => x.id === evTarget.dataset.event);
      if (ev) openDrawer(ev);
      return;
    }

    if (e.target.closest('#drawerClose') || e.target.id === 'drawerScrim') closeDrawer();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const lb = document.getElementById('lightbox');
    if (lb && !lb.hidden) closeLightbox();
    else closeDrawer();
  });

  document.getElementById('serverSelect').addEventListener('change', (e) => {
    state.server = e.target.value;
    store.set('server', state.server);
    render();
  });
  document.getElementById('typeSelect').addEventListener('change', (e) => {
    state.type = e.target.value;
    store.set('type', state.type);
    render();
  });
  document.getElementById('sortSelect').addEventListener('change', (e) => {
    state.sort = e.target.value;
    store.set('sort', state.sort);
    render();
  });

  let searchTimer = null;
  document.getElementById('searchInput').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.query = e.target.value.trim();
      store.set('query', state.query);
      render();
    }, 160);
  });

  /* ---------------- full banner lightbox ---------------- */

  function openLightbox(src, caption) {
    const box = document.getElementById('lightbox');
    const img = document.getElementById('lightboxImg');
    const cap = document.getElementById('lightboxCap');
    if (!box || !img || !src) return;
    img.src = src;
    img.alt = caption ? `${caption} — full banner` : 'Full event banner';
    if (cap) cap.textContent = caption || '';
    box.hidden = false;
  }

  function closeLightbox() {
    const box = document.getElementById('lightbox');
    const img = document.getElementById('lightboxImg');
    if (!box) return;
    box.hidden = true;
    if (img) img.removeAttribute('src');
  }

  /* ---------------- calendar drag-to-pan ---------------- */

  let dragState = null;
  let suppressClick = false;

  function dragStart(e) {
    if (e.pointerType === 'touch') return;   // native touch scrolling handles it
    if (e.button !== 0) return;
    const scroller = e.target && e.target.closest ? e.target.closest('#tlScroll') : null;
    if (!scroller) return;
    dragState = {
      scroller,
      x: e.clientX,
      y: e.clientY,
      left: scroller.scrollLeft,
      top: scroller.scrollTop,
      scale: (scroller.offsetWidth ? scroller.getBoundingClientRect().width / scroller.offsetWidth : 1) || 1,
      moved: false
    };
    scroller.classList.add('is-dragging');
  }

  function dragMove(e) {
    if (!dragState) return;
    const rawX = e.clientX - dragState.x;
    const rawY = e.clientY - dragState.y;
    if (!dragState.moved && Math.abs(rawX) < 5 && Math.abs(rawY) < 5) return;
    if (e.cancelable) e.preventDefault();
    dragState.moved = true;
    const s = dragState.scale || 1;
    dragState.scroller.scrollLeft = dragState.left - rawX / s;
    dragState.scroller.scrollTop = dragState.top - rawY / s;
  }

  function dragEnd() {
    if (!dragState) return;
    dragState.scroller.classList.remove('is-dragging');
    if (dragState.moved) {
      suppressClick = true;               // a drag must not open the event modal
      setTimeout(() => { suppressClick = false; }, 120);
    }
    dragState = null;
  }

  document.addEventListener('pointerdown', dragStart);
  document.addEventListener('pointermove', dragMove, { passive: false });
  document.addEventListener('pointerup', dragEnd);
  document.addEventListener('pointercancel', dragEnd);
  window.addEventListener('blur', dragEnd);

  /* ---------------- back to top + scroll progress ---------------- */

  const toTopEl = document.getElementById('toTop');
  const ringFillEl = document.getElementById('ringFill');
  let ringLen = 0;

  function initRing() {
    if (!ringFillEl) return;
    try {
      ringLen = ringFillEl.getTotalLength();
      ringFillEl.style.strokeDasharray = String(ringLen);
      ringFillEl.style.strokeDashoffset = String(ringLen);
    } catch (_) { /* older engines: ring simply stays a full-track outline */ }
  }

  function updateToTop() {
    if (!toTopEl || !ringFillEl) return;
    const de = document.documentElement;
    const max = de.scrollHeight - de.clientHeight;
    const y = de.scrollTop || 0;
    const p = max > 0 ? Math.min(1, Math.max(0, y / max)) : 0;
    if (ringLen) ringFillEl.style.strokeDashoffset = String(ringLen * (1 - p));
    const hide = y < 320;
    toTopEl.hidden = hide;
    toTopEl.setAttribute('aria-hidden', String(hide));
  }

  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /* ---------------- filter dropdown ---------------- */

  const filterToggleEl = document.getElementById('filterToggle');

  function setFiltersOpen(open) {
    document.body.classList.toggle('filters-open', open);
    if (filterToggleEl) filterToggleEl.setAttribute('aria-expanded', String(open));
  }

  function updateFilterSummary() {
    const el = document.getElementById('filterSummary');
    if (!el) return;
    const parts = [];
    const chips = document.querySelectorAll('.chip[data-game]');
    const on = document.querySelectorAll('.chip[data-game][aria-pressed="true"]').length;
    parts.push(!chips.length || on === chips.length ? 'All games' : on + '/' + chips.length + ' games');
    const seg = document.querySelector('.seg-btn[aria-pressed="true"]');
    if (seg && seg.dataset.status !== 'all') parts.push(seg.textContent.trim());
    const type = document.getElementById('typeSelect');
    if (type && type.value !== 'all' && type.selectedIndex >= 0) parts.push(type.options[type.selectedIndex].text);
    const q = document.getElementById('searchInput');
    if (q && q.value) parts.push('\u201C' + q.value + '\u201D');
    el.textContent = parts.join(' · ');
  }

  if (filterToggleEl) {
    filterToggleEl.addEventListener('click', (e) => {
      e.stopPropagation();
      setFiltersOpen(!document.body.classList.contains('filters-open'));
    });
  }
  document.addEventListener('click', (e) => {
    if (!document.body.classList.contains('filters-open')) return;
    const panel = document.getElementById('filterPanel');
    // composedPath survives the chips re-rendering mid-click; closest() on a
    // detached target would wrongly look like an outside click
    const path = e.composedPath ? e.composedPath() : [];
    if ((panel && path.indexOf(panel) !== -1) || path.indexOf(filterToggleEl) !== -1) return;
    if (e.target && e.target.closest && (e.target.closest('#filterPanel') || e.target.closest('#filterToggle'))) return;
    setFiltersOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setFiltersOpen(false);
  });

  /* ---------------- compact header on scroll ---------------- */

  let headerCompact = false;

  function updateHeader() {
    const y = window.scrollY || document.documentElement.scrollTop || 0;
    const want = y > 90 ? true : (y < 30 ? false : headerCompact); // hysteresis, no flicker
    if (want === headerCompact) return;
    headerCompact = want;
    document.body.classList.toggle('nav-compact', want);
  }

  if (toTopEl) {
    initRing();
    toTopEl.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
    });
    let lastTick = 0;
    let trailing = 0;
    const onScroll = () => {
      const now = Date.now();
      if (now - lastTick < 80) {
        clearTimeout(trailing);
        trailing = setTimeout(onScroll, 90);
        return;
      }
      lastTick = now;
      updateToTop();
      updateHeader();
    };
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    document.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', () => { updateToTop(); updateHeader(); });
    // safety net: some engines drop scroll events for certain programmatic
    // scrolls — this guarantees state always converges (idempotent, cheap)
    setInterval(() => { updateToTop(); updateHeader(); }, 250);
    updateToTop();
    updateHeader();
  }

  render();
})();
