/* Poker Night — mobile-first PWA
 * Single-file vanilla JS app. LocalStorage persistence.
 * Views: home, live, history, leaderboard, profile.
 */

'use strict';

// ----------------------- Storage & State -----------------------

const STORAGE_KEY = 'pokerNight.v1';

const defaultState = () => ({
  me: null,                 // { id, name, phone, avatar }
  users: {},                // id -> { id, name, phone, avatar }
  games: {},                // id -> game
  gameOrder: [],            // ids, most recent first
  activeTab: 'home',
  currentGameId: null,      // last visited live game
  currency: '£',
});

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return { ...defaultState(), ...parsed };
  } catch (e) {
    console.warn('state load failed', e);
    return defaultState();
  }
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (e) { toast('Storage full', 'error'); }
}

function uid(prefix = '') {
  return prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

// ----------------------- Game Model -----------------------

function newGame({ name, date, location, buyIn, chipValue, startingFloat, hostId }) {
  return {
    id: uid('g_'),
    name, date, location,
    buyIn: Number(buyIn) || 0,
    chipValue: Number(chipValue) || 1,
    startingFloat: Number(startingFloat) || 0,
    status: 'draft',        // draft | active | ended
    hostId,
    createdAt: Date.now(),
    startedAt: null,
    endedAt: null,
    players: {},            // userId -> { userId, joinedAt, buyIns: [{amount, ts, note}], cashOuts: [{chips, amount, ts}], status: 'active'|'cashed' }
    playerOrder: [],
    settlement: null,       // { tx: [{from, to, amount, paid:bool}], generatedAt }
    inviteToken: uid('i_'),
  };
}

function getGame(id) { return state.games[id]; }
function setGame(g) { state.games[g.id] = g; save(); }

function getUser(id) { return state.users[id]; }
function ensureUser({ name, phone, avatar }) {
  // Find by phone first (normalised), then by name
  const norm = (phone || '').replace(/\s+/g, '');
  if (norm) {
    for (const u of Object.values(state.users)) {
      if ((u.phone || '').replace(/\s+/g, '') === norm) return u;
    }
  }
  if (!norm) {
    for (const u of Object.values(state.users)) {
      if (u.name.toLowerCase() === (name || '').toLowerCase()) return u;
    }
  }
  const u = { id: uid('u_'), name: name || 'Player', phone: phone || '', avatar: avatar || initials(name || 'P') };
  state.users[u.id] = u;
  save();
  return u;
}

function initials(name) {
  return (name || '?').trim().split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
}

function addPlayerToGame(game, user) {
  if (game.players[user.id]) return;
  game.players[user.id] = {
    userId: user.id,
    joinedAt: Date.now(),
    buyIns: [],
    cashOuts: [],
    status: 'active',
  };
  game.playerOrder.push(user.id);
  setGame(game);
}

function recordBuyIn(game, userId, amount, note = '') {
  const p = game.players[userId];
  if (!p) return;
  if (p.status === 'cashed') {
    p.status = 'active'; // rebuy after cash-out revives them
  }
  p.buyIns.push({ amount: Number(amount), ts: Date.now(), note });
  setGame(game);
}

function recordCashOut(game, userId, chips) {
  const p = game.players[userId];
  if (!p) return;
  const amount = Number(chips) * Number(game.chipValue);
  p.cashOuts.push({ chips: Number(chips), amount, ts: Date.now() });
  p.status = 'cashed';
  setGame(game);
}

function voidLastTx(game, userId) {
  const p = game.players[userId];
  if (!p) return;
  const txs = [
    ...p.buyIns.map((t, i) => ({ t, i, kind: 'buy' })),
    ...p.cashOuts.map((t, i) => ({ t, i, kind: 'cash' })),
  ].sort((a, b) => b.t.ts - a.t.ts);
  if (!txs.length) return;
  const last = txs[0];
  if (last.kind === 'buy') p.buyIns.splice(last.i, 1);
  else {
    p.cashOuts.splice(last.i, 1);
    if (!p.cashOuts.length) p.status = 'active';
  }
  setGame(game);
}

function playerTotalIn(p) { return p.buyIns.reduce((s, b) => s + b.amount, 0); }
function playerTotalOut(p) { return p.cashOuts.reduce((s, c) => s + c.amount, 0); }
function playerNet(p) { return playerTotalOut(p) - playerTotalIn(p); }

function gameTotals(game) {
  let inSum = 0, outSum = 0, active = 0, cashed = 0;
  for (const p of Object.values(game.players)) {
    inSum += playerTotalIn(p);
    outSum += playerTotalOut(p);
    if (p.status === 'active') active++; else cashed++;
  }
  return { inSum, outSum, active, cashed, floatCash: (game.startingFloat + inSum - outSum) };
}

// ----------------------- Settlement Algorithm -----------------------
// Minimises transaction count via greedy max-creditor/max-debtor pairing.

function computeSettlement(game) {
  // Net per user in currency terms
  const nets = [];
  for (const p of Object.values(game.players)) {
    const net = playerNet(p); // positive = owed money, negative = owes money
    if (Math.abs(net) < 0.005) continue;
    nets.push({ userId: p.userId, net });
  }
  // Round to 2dp to avoid fp drift
  nets.forEach(n => n.net = Math.round(n.net * 100) / 100);

  const creditors = nets.filter(n => n.net > 0).sort((a, b) => b.net - a.net);
  const debtors = nets.filter(n => n.net < 0).sort((a, b) => a.net - b.net);
  const tx = [];

  let i = 0, j = 0;
  // Deep copies so we don't mutate UI data
  const C = creditors.map(x => ({ ...x }));
  const D = debtors.map(x => ({ ...x }));
  while (i < D.length && j < C.length) {
    const d = D[i], c = C[j];
    const amount = Math.min(-d.net, c.net);
    if (amount > 0.005) {
      tx.push({
        from: d.userId, to: c.userId,
        amount: Math.round(amount * 100) / 100,
        paid: false,
      });
    }
    d.net += amount;
    c.net -= amount;
    if (Math.abs(d.net) < 0.005) i++;
    if (Math.abs(c.net) < 0.005) j++;
  }
  return { tx, generatedAt: Date.now() };
}

// ----------------------- Router / Views -----------------------

const $view = document.getElementById('view');
const $tabbar = document.getElementById('tabbar');

function setTab(tab) {
  state.activeTab = tab;
  save();
  render();
}

$tabbar.addEventListener('click', (e) => {
  const t = e.target.closest('.tab');
  if (!t) return;
  setTab(t.dataset.tab);
});

function render() {
  // Update tab state
  for (const t of $tabbar.querySelectorAll('.tab')) {
    t.classList.toggle('active', t.dataset.tab === state.activeTab);
  }

  // Handle first-run onboarding
  if (!state.me) { renderOnboarding(); return; }

  switch (state.activeTab) {
    case 'home':        renderHome(); break;
    case 'live':        renderLive(); break;
    case 'history':     renderHistory(); break;
    case 'leaderboard': renderLeaderboard(); break;
    case 'profile':     renderProfile(); break;
    default:            renderHome();
  }
}

// ----------------------- Onboarding -----------------------

function renderOnboarding() {
  const inviteParams = parseInviteParams();

  $view.innerHTML = `
    <div class="brand">
      <div class="logo">♠♦</div>
      <div>
        <h1>Poker Night</h1>
        <div class="tag">House games, made easy.</div>
      </div>
    </div>
    ${inviteParams.token ? `
      <div class="card">
        <h3>You've been invited</h3>
        <div class="muted">Enter your name and phone to join the game.</div>
      </div>
    ` : `
      <div class="card">
        <h3>Welcome</h3>
        <div class="muted">In a real launch, we'd send a WhatsApp OTP. For this preview, just tell us your name and number.</div>
      </div>
    `}
    <form id="onboard-form" class="card">
      <div class="field">
        <label for="f-name">Your name</label>
        <input id="f-name" required placeholder="e.g. Alex Patel" autocomplete="name" />
      </div>
      <div class="field">
        <label for="f-phone">Mobile number</label>
        <input id="f-phone" required inputmode="tel" placeholder="+44 7700 900000" autocomplete="tel" />
      </div>
      <button type="submit" class="btn primary">Continue</button>
    </form>
    <div class="muted center" style="font-size:12px;margin-top:16px;">By continuing you agree that this is a record-keeping tool, not a gambling platform.</div>
  `;

  document.getElementById('onboard-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('f-name').value.trim();
    const phone = document.getElementById('f-phone').value.trim();
    if (!name || !phone) return;
    const u = ensureUser({ name, phone });
    state.me = u;
    save();

    // Honour invite if present
    if (inviteParams.token) {
      const g = findGameByInviteToken(inviteParams.token);
      if (g && g.status !== 'ended') {
        addPlayerToGame(g, u);
        state.currentGameId = g.id;
        state.activeTab = 'live';
        save();
        toast(`Joined "${g.name}"`, 'success');
        render();
        return;
      } else {
        toast('Invite link expired', 'error');
      }
    }
    render();
  });
}

function parseInviteParams() {
  const hash = window.location.hash || '';
  const m = hash.match(/^#\/invite\/([^\/\?]+)(?:\?(.*))?/);
  if (!m) return {};
  return { token: decodeURIComponent(m[1]), gameId: null };
}

function findGameByInviteToken(token) {
  return Object.values(state.games).find(g => g.inviteToken === token);
}

// ----------------------- Home -----------------------

function renderHome() {
  const active = Object.values(state.games).filter(g => g.status === 'active').sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
  const drafts = Object.values(state.games).filter(g => g.status === 'draft').sort((a, b) => b.createdAt - a.createdAt);
  const recent = Object.values(state.games).filter(g => g.status === 'ended').sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0)).slice(0, 3);

  $view.innerHTML = `
    <div class="brand">
      <div class="logo">♠♦</div>
      <div>
        <h1>Poker Night</h1>
        <div class="tag">Hey, ${escape(state.me.name)} — ready to deal?</div>
      </div>
    </div>

    <button id="create-game" class="btn primary" style="margin-bottom:16px;">+ Create Game</button>

    ${active.length ? `
      <div class="section-h"><h2>Active</h2></div>
      ${active.map(renderGameItem).join('')}
    ` : ''}

    ${drafts.length ? `
      <div class="section-h"><h2>Drafts</h2></div>
      ${drafts.map(renderGameItem).join('')}
    ` : ''}

    ${recent.length ? `
      <div class="section-h"><h2>Recent</h2></div>
      ${recent.map(renderGameItem).join('')}
    ` : ''}

    ${!active.length && !drafts.length && !recent.length ? `
      <div class="empty">
        <div class="big"><span class="suits">♠<span class="r">♥</span>♣<span class="r">♦</span></span></div>
        <div>No games yet — tap "Create Game" to start your first night.</div>
      </div>
    ` : ''}
  `;

  document.getElementById('create-game').addEventListener('click', openCreateGameSheet);

  for (const el of $view.querySelectorAll('.game-item')) {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      const g = getGame(id);
      if (!g) return;
      state.currentGameId = id;
      save();
      if (g.status === 'ended') openGameSummary(g);
      else setTab('live');
    });
  }
}

function renderGameItem(g) {
  const when = g.date ? fmtDate(g.date) : (g.startedAt ? fmtDate(g.startedAt) : fmtDate(g.createdAt));
  const totals = gameTotals(g);
  const subtitle = g.status === 'ended'
    ? `${Object.keys(g.players).length} players · ${state.currency}${fmt(totals.inSum)} in play`
    : `${Object.keys(g.players).length} players${g.location ? ' · ' + escape(g.location) : ''}`;
  return `
    <div class="game-item" data-id="${g.id}">
      <div>
        <div class="strong">${escape(g.name)}</div>
        <div class="meta">${when} · ${subtitle}</div>
      </div>
      <div class="status ${g.status}">${g.status}</div>
    </div>
  `;
}

// ----------------------- Create Game Sheet -----------------------

function openCreateGameSheet() {
  openSheet(`
    <h2>Create Game</h2>
    <form id="create-form">
      <div class="field">
        <label for="g-name">Game name</label>
        <input id="g-name" required placeholder="Friday Night Cash Game" />
      </div>
      <div class="field row">
        <div>
          <label for="g-date">Date</label>
          <input id="g-date" type="date" value="${todayISO()}" />
        </div>
        <div>
          <label for="g-float">Starting float (${state.currency})</label>
          <input id="g-float" type="number" inputmode="decimal" min="0" value="0" />
        </div>
      </div>
      <div class="field">
        <label for="g-location">Location (optional)</label>
        <input id="g-location" placeholder="My place" />
      </div>
      <div class="field row">
        <div>
          <label for="g-buyin">Buy-in (${state.currency})</label>
          <input id="g-buyin" type="number" inputmode="decimal" min="0" value="50" required />
        </div>
        <div>
          <label for="g-chip">Chip value (${state.currency})</label>
          <input id="g-chip" type="number" inputmode="decimal" min="0.01" step="0.01" value="0.25" required />
        </div>
      </div>
      <div class="btn-row mt-16">
        <button type="button" class="btn ghost" id="cancel-create">Cancel</button>
        <button type="submit" class="btn primary">Create</button>
      </div>
    </form>
  `);

  document.getElementById('cancel-create').addEventListener('click', closeSheet);
  document.getElementById('create-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const g = newGame({
      name: document.getElementById('g-name').value.trim() || 'Poker Night',
      date: document.getElementById('g-date').value,
      location: document.getElementById('g-location').value.trim(),
      buyIn: document.getElementById('g-buyin').value,
      chipValue: document.getElementById('g-chip').value,
      startingFloat: document.getElementById('g-float').value,
      hostId: state.me.id,
    });
    // Host auto-joins as a player
    addPlayerToGame(g, state.me);
    g.status = 'active';
    g.startedAt = Date.now();
    setGame(g);
    state.gameOrder.unshift(g.id);
    state.currentGameId = g.id;
    save();
    closeSheet();
    setTab('live');
    toast('Game started', 'success');
    haptic();
  });
}

// ----------------------- Live Game -----------------------

function renderLive() {
  const g = state.currentGameId ? getGame(state.currentGameId) : null;
  const activeGames = Object.values(state.games).filter(x => x.status === 'active');

  if (!g || g.status === 'ended') {
    if (activeGames.length) {
      // Default to first active
      state.currentGameId = activeGames[0].id;
      save();
      renderLive();
      return;
    }
    $view.innerHTML = `
      <div class="view-header">
        <div><h1>Live</h1><div class="sub">No active game</div></div>
      </div>
      <div class="empty">
        <div class="big">🎲</div>
        <div>Nothing running right now.</div>
        <button id="to-home" class="btn primary" style="max-width:220px;margin:16px auto 0;">Back to Home</button>
      </div>
    `;
    document.getElementById('to-home').addEventListener('click', () => setTab('home'));
    return;
  }

  const totals = gameTotals(g);
  const balanced = Math.abs(totals.inSum - totals.outSum) < 0.005;
  const host = getUser(g.hostId);

  $view.innerHTML = `
    <div class="view-header">
      <div>
        <h1>${escape(g.name)}</h1>
        <div class="sub">${fmtDate(g.date || g.startedAt)} · Host: ${host ? escape(host.name) : 'Unknown'}</div>
      </div>
      <button id="more-btn" class="btn ghost small" aria-label="More">⋯</button>
    </div>

    <div class="float-bar">
      <div class="stat">
        <div class="v">${state.currency}${fmt(totals.inSum)}</div>
        <div class="l">Total In</div>
      </div>
      <div class="stat">
        <div class="v">${state.currency}${fmt(totals.outSum)}</div>
        <div class="l">Cashed Out</div>
      </div>
      <div class="stat ${balanced ? 'good' : 'bad'}">
        <div class="v">${state.currency}${fmt(totals.floatCash)}</div>
        <div class="l">Float</div>
      </div>
    </div>

    <div class="btn-row mb-16">
      <button id="invite-btn" class="btn ghost">+ Invite</button>
      <button id="add-player-btn" class="btn ghost">+ Player</button>
    </div>

    ${g.playerOrder.length ? g.playerOrder.map(uid => renderPlayerRow(g, uid)).join('') : `
      <div class="empty"><div class="big">👥</div><div>Add players to get started.</div></div>
    `}

    <div class="mt-16">
      <button id="end-game" class="btn primary">End Game & Settle</button>
    </div>
  `;

  document.getElementById('invite-btn').addEventListener('click', () => openInviteSheet(g));
  document.getElementById('add-player-btn').addEventListener('click', () => openAddPlayerSheet(g));
  document.getElementById('end-game').addEventListener('click', () => openEndGameSheet(g));
  document.getElementById('more-btn').addEventListener('click', () => openGameMoreSheet(g));

  for (const el of $view.querySelectorAll('.player-row')) {
    el.addEventListener('click', () => openPlayerSheet(g, el.dataset.uid));
  }
}

function renderPlayerRow(g, userId) {
  const u = getUser(userId);
  const p = g.players[userId];
  if (!u || !p) return '';
  const tIn = playerTotalIn(p);
  const tOut = playerTotalOut(p);
  const net = tOut - tIn;
  const chips = Math.max(0, tIn - tOut) / g.chipValue;
  const isCashed = p.status === 'cashed';

  return `
    <div class="player-row ${isCashed ? 'cashed' : ''}" data-uid="${userId}">
      <div class="pinfo">
        <div class="avatar">${escape(initials(u.name))}</div>
        <div>
          <div class="name">${escape(u.name)}${u.id === g.hostId ? ' <span class="muted" style="font-size:11px;">· Host</span>' : ''}</div>
          <div class="stats">
            In ${state.currency}${fmt(tIn)}${isCashed ? ` · Out ${state.currency}${fmt(tOut)}` : ` · ~${fmt(chips)} chips`}
          </div>
        </div>
      </div>
      <div class="right">
        ${isCashed ? `
          <div class="label">Net</div>
          <div class="net ${net >= 0 ? 'pos' : 'neg'}">${net >= 0 ? '+' : '−'}${state.currency}${fmt(Math.abs(net))}</div>
        ` : `
          <div class="label">Status</div>
          <div class="strong">Playing</div>
        `}
      </div>
    </div>
  `;
}

// Player actions sheet
function openPlayerSheet(g, userId) {
  const u = getUser(userId);
  const p = g.players[userId];
  if (!u || !p) return;
  const tIn = playerTotalIn(p);
  const tOut = playerTotalOut(p);

  openSheet(`
    <h2>${escape(u.name)}</h2>
    <div class="card">
      <div class="muted" style="font-size:12px;">In / Out</div>
      <div class="strong" style="font-size:18px;">${state.currency}${fmt(tIn)} · ${state.currency}${fmt(tOut)}</div>
      <div class="muted" style="font-size:12px;margin-top:8px;">Buy-ins: ${p.buyIns.length} · Cash-outs: ${p.cashOuts.length}</div>
    </div>
    <div class="field">
      <label for="amt">Amount (${state.currency})</label>
      <input id="amt" type="number" inputmode="decimal" min="0" step="0.01" value="${fmt(g.buyIn)}" />
    </div>
    <div class="btn-row">
      <button class="btn primary" id="buyin-btn">Buy In</button>
      ${p.status === 'active' ? `<button class="btn danger" id="cashout-btn">Cash Out</button>` : `<button class="btn ghost" id="rebuy-btn">Rebuy</button>`}
    </div>
    <button class="btn ghost mt-8" id="void-btn">Undo Last Transaction</button>
    ${u.id !== g.hostId && !p.buyIns.length && !p.cashOuts.length ? `
      <button class="btn danger mt-8" id="remove-btn">Remove from Game</button>
    ` : ''}
  `);

  document.getElementById('buyin-btn').addEventListener('click', () => {
    const v = parseFloat(document.getElementById('amt').value);
    if (!(v > 0)) return toast('Enter a valid amount', 'error');
    recordBuyIn(g, userId, v);
    closeSheet();
    haptic();
    toast(`${escape(u.name)} bought in ${state.currency}${fmt(v)}`, 'success');
    render();
  });

  const cashBtn = document.getElementById('cashout-btn');
  if (cashBtn) cashBtn.addEventListener('click', () => openCashOutSheet(g, userId));

  const rebuyBtn = document.getElementById('rebuy-btn');
  if (rebuyBtn) rebuyBtn.addEventListener('click', () => {
    const v = parseFloat(document.getElementById('amt').value);
    if (!(v > 0)) return toast('Enter a valid amount', 'error');
    recordBuyIn(g, userId, v);
    closeSheet();
    haptic();
    toast(`${escape(u.name)} rebought ${state.currency}${fmt(v)}`, 'success');
    render();
  });

  document.getElementById('void-btn').addEventListener('click', () => {
    voidLastTx(g, userId);
    closeSheet();
    toast('Last transaction undone');
    render();
  });

  const rm = document.getElementById('remove-btn');
  if (rm) rm.addEventListener('click', () => {
    if (!confirm(`Remove ${u.name} from this game?`)) return;
    delete g.players[userId];
    g.playerOrder = g.playerOrder.filter(x => x !== userId);
    setGame(g);
    closeSheet();
    render();
  });
}

// Cash out: enter chips, auto-calc cash
function openCashOutSheet(g, userId) {
  const u = getUser(userId);
  const p = g.players[userId];
  const tIn = playerTotalIn(p);
  const tOut = playerTotalOut(p);
  const netSoFar = tOut - tIn;
  // estimated chips = remaining stake / chipValue
  const estChips = Math.max(0, (tIn - tOut) / g.chipValue);

  openSheet(`
    <h2>Cash Out · ${escape(u.name)}</h2>
    <div class="card">
      <div class="muted" style="font-size:12px;">Bought in</div>
      <div class="strong">${state.currency}${fmt(tIn)}</div>
      <div class="muted" style="font-size:12px;margin-top:8px;">Est. chips if exactly break-even</div>
      <div class="mono">${fmt(estChips)} chips</div>
    </div>
    <div class="field">
      <label for="chips">Chip count</label>
      <input id="chips" type="number" inputmode="decimal" min="0" step="1" value="${Math.round(estChips)}" autofocus />
    </div>
    <div class="field">
      <label>Cash value</label>
      <div id="cash-preview" class="mono strong" style="font-size:18px;">${state.currency}0.00</div>
    </div>
    <div class="btn-row">
      <button class="btn ghost" id="co-cancel">Cancel</button>
      <button class="btn danger" id="co-confirm">Confirm Cash Out</button>
    </div>
  `);

  const chipsEl = document.getElementById('chips');
  const preview = document.getElementById('cash-preview');
  const updatePreview = () => {
    const n = Number(chipsEl.value) || 0;
    const val = n * g.chipValue;
    const net = val - tIn;
    preview.textContent = `${state.currency}${fmt(val)} (${net >= 0 ? '+' : '−'}${state.currency}${fmt(Math.abs(net))})`;
    preview.className = 'mono strong';
    preview.style.color = net >= 0 ? 'var(--accent)' : 'var(--danger)';
  };
  chipsEl.addEventListener('input', updatePreview);
  updatePreview();

  document.getElementById('co-cancel').addEventListener('click', closeSheet);
  document.getElementById('co-confirm').addEventListener('click', () => {
    const n = Number(chipsEl.value);
    if (!(n >= 0)) return toast('Enter a chip count', 'error');
    recordCashOut(g, userId, n);
    closeSheet();
    haptic();
    toast(`${escape(u.name)} cashed out`, 'success');
    render();
  });
}

// Invite sheet
function openInviteSheet(g) {
  const url = inviteUrl(g);
  const msg = `You're invited to "${g.name}" 🎰\nBuy-in: ${state.currency}${fmt(g.buyIn)}\nWhen: ${fmtDate(g.date || g.startedAt)}${g.location ? `\nWhere: ${g.location}` : ''}\n\nTap to join: ${url}`;
  const waUrl = `https://wa.me/?text=${encodeURIComponent(msg)}`;

  openSheet(`
    <h2>Invite Players</h2>
    <div class="card">
      <div class="muted" style="font-size:12px;">Share link</div>
      <div class="invite-box mt-8" id="invite-link">${escape(url)}</div>
    </div>
    <div class="btn-row mt-16">
      <button class="btn ghost" id="copy-btn">Copy Link</button>
      <a href="${waUrl}" target="_blank" rel="noopener" class="btn primary" style="text-decoration:none;">Share on WhatsApp</a>
    </div>
    <button class="btn ghost mt-8" id="close-invite">Close</button>
  `);

  document.getElementById('copy-btn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied', 'success');
    } catch {
      toast('Copy failed — select and copy manually', 'error');
    }
  });
  document.getElementById('close-invite').addEventListener('click', closeSheet);
}

function inviteUrl(g) {
  const base = window.location.origin + window.location.pathname;
  return `${base}#/invite/${encodeURIComponent(g.inviteToken)}`;
}

// Add player manually
function openAddPlayerSheet(g) {
  const existingIds = new Set(g.playerOrder);
  const availUsers = Object.values(state.users).filter(u => !existingIds.has(u.id));

  openSheet(`
    <h2>Add Player</h2>
    <div class="field">
      <label for="new-name">New player</label>
      <input id="new-name" placeholder="Name" />
    </div>
    <div class="field">
      <label for="new-phone">Phone (optional)</label>
      <input id="new-phone" placeholder="+44 7700 900000" inputmode="tel" />
    </div>
    <button class="btn primary" id="add-new">Add</button>
    ${availUsers.length ? `
      <div class="section-h mt-16"><h2>From previous games</h2></div>
      ${availUsers.map(u => `
        <div class="player-row" data-uid="${u.id}" style="cursor:pointer;">
          <div class="pinfo">
            <div class="avatar">${escape(initials(u.name))}</div>
            <div>
              <div class="name">${escape(u.name)}</div>
              <div class="stats">${u.phone ? escape(u.phone) : '—'}</div>
            </div>
          </div>
          <div class="right"><span class="muted">Tap to add</span></div>
        </div>
      `).join('')}
    ` : ''}
    <button class="btn ghost mt-16" id="close-add">Close</button>
  `);

  document.getElementById('add-new').addEventListener('click', () => {
    const name = document.getElementById('new-name').value.trim();
    const phone = document.getElementById('new-phone').value.trim();
    if (!name) return toast('Enter a name', 'error');
    const u = ensureUser({ name, phone });
    addPlayerToGame(g, u);
    closeSheet();
    toast(`${escape(name)} added`, 'success');
    render();
  });

  for (const row of document.querySelectorAll('.sheet .player-row')) {
    row.addEventListener('click', () => {
      const u = getUser(row.dataset.uid);
      if (!u) return;
      addPlayerToGame(g, u);
      closeSheet();
      toast(`${escape(u.name)} added`, 'success');
      render();
    });
  }

  document.getElementById('close-add').addEventListener('click', closeSheet);
}

// More actions: edit config, cancel game
function openGameMoreSheet(g) {
  openSheet(`
    <h2>Game Options</h2>
    <div class="card">
      <div class="muted" style="font-size:12px;">Buy-in default</div>
      <div class="strong">${state.currency}${fmt(g.buyIn)}</div>
      <div class="muted" style="font-size:12px;margin-top:8px;">Chip value</div>
      <div class="strong">${state.currency}${fmt(g.chipValue)}</div>
    </div>
    <button class="btn ghost" id="edit-config">Edit Buy-in / Chip Value</button>
    <button class="btn danger mt-8" id="cancel-game">Cancel Game (delete)</button>
    <button class="btn ghost mt-8" id="close-more">Close</button>
  `);

  document.getElementById('edit-config').addEventListener('click', () => {
    const bi = prompt('Buy-in amount', g.buyIn);
    if (bi === null) return;
    const cv = prompt('Chip value', g.chipValue);
    if (cv === null) return;
    g.buyIn = Number(bi) || g.buyIn;
    g.chipValue = Number(cv) || g.chipValue;
    setGame(g);
    closeSheet();
    toast('Updated');
    render();
  });

  document.getElementById('cancel-game').addEventListener('click', () => {
    if (!confirm('Delete this game? This cannot be undone.')) return;
    delete state.games[g.id];
    state.gameOrder = state.gameOrder.filter(x => x !== g.id);
    if (state.currentGameId === g.id) state.currentGameId = null;
    save();
    closeSheet();
    setTab('home');
  });

  document.getElementById('close-more').addEventListener('click', closeSheet);
}

// End game & settle
function openEndGameSheet(g) {
  const totals = gameTotals(g);
  const uncashed = Object.values(g.players).filter(p => p.status === 'active');
  const diff = totals.outSum - totals.inSum;
  const balanced = Math.abs(diff) < 0.005;

  openSheet(`
    <h2>End Game</h2>
    <div class="card">
      <div><span class="muted">Total in</span> <span class="strong" style="float:right;">${state.currency}${fmt(totals.inSum)}</span></div>
      <div class="mt-8"><span class="muted">Total out</span> <span class="strong" style="float:right;">${state.currency}${fmt(totals.outSum)}</span></div>
      <div class="mt-8"><span class="muted">Difference</span> <span class="strong ${balanced ? 'pos' : 'warn'}" style="float:right;">${balanced ? 'Balanced' : `${state.currency}${fmt(Math.abs(diff))}`}</span></div>
    </div>
    ${uncashed.length ? `
      <div class="card" style="border-color:var(--warn);">
        <div class="strong warn">${uncashed.length} player${uncashed.length > 1 ? 's' : ''} not cashed out yet</div>
        <div class="muted" style="font-size:13px;margin-top:6px;">Cash everyone out first for an accurate settlement.</div>
      </div>
    ` : ''}
    ${!balanced && !uncashed.length ? `
      <div class="card" style="border-color:var(--warn);">
        <div class="strong warn">Buy-ins don't match cash-outs by ${state.currency}${fmt(Math.abs(diff))}</div>
        <div class="muted" style="font-size:13px;margin-top:6px;">Recheck chip counts, or accept the discrepancy (may represent rake/float difference).</div>
      </div>
    ` : ''}
    <div class="btn-row mt-16">
      <button class="btn ghost" id="back-btn">Back</button>
      <button class="btn primary" id="settle-btn" ${uncashed.length ? 'disabled' : ''}>Calculate Settlement</button>
    </div>
  `);

  document.getElementById('back-btn').addEventListener('click', closeSheet);
  document.getElementById('settle-btn').addEventListener('click', () => {
    g.settlement = computeSettlement(g);
    g.status = 'ended';
    g.endedAt = Date.now();
    setGame(g);
    closeSheet();
    haptic();
    openSettlement(g);
  });
}

function openSettlement(g) {
  const tx = g.settlement ? g.settlement.tx : [];
  const nets = Object.values(g.players).map(p => ({
    user: getUser(p.userId),
    net: playerNet(p),
  })).sort((a, b) => b.net - a.net);

  $view.innerHTML = `
    <div class="view-header">
      <div>
        <h1>Settlement</h1>
        <div class="sub">${escape(g.name)} · ${fmtDate(g.endedAt || Date.now())}</div>
      </div>
    </div>

    <div class="section-h"><h2>Final Positions</h2></div>
    ${nets.map(n => `
      <div class="lb-row">
        <div class="avatar">${escape(initials(n.user?.name || '?'))}</div>
        <div class="who">${escape(n.user?.name || 'Unknown')}</div>
        <div class="pnl ${n.net >= 0 ? 'pos' : 'neg'}">${n.net >= 0 ? '+' : '−'}${state.currency}${fmt(Math.abs(n.net))}</div>
      </div>
    `).join('')}

    <div class="section-h"><h2>Who pays whom</h2></div>
    ${tx.length === 0 ? `
      <div class="empty"><div class="big">✅</div><div>Everyone broke even. Nothing to settle.</div></div>
    ` : tx.map((t, i) => `
      <div class="settle-tx ${t.paid ? 'done' : ''}" data-i="${i}">
        <div>
          <div class="strong">${escape(getUser(t.from)?.name || '?')}</div>
          <div class="muted" style="font-size:12px;">pays</div>
        </div>
        <div class="arrow">→</div>
        <div style="flex:1;">
          <div class="strong">${escape(getUser(t.to)?.name || '?')}</div>
        </div>
        <div class="amt">${state.currency}${fmt(t.amount)}</div>
        <input type="checkbox" style="width:22px;height:22px;margin-left:12px;" ${t.paid ? 'checked' : ''} />
      </div>
    `).join('')}

    <div class="btn-row mt-16">
      <button class="btn ghost" id="share-btn">Share to WhatsApp</button>
      <button class="btn primary" id="done-btn">Done</button>
    </div>
  `;

  for (const el of $view.querySelectorAll('.settle-tx')) {
    el.addEventListener('click', (e) => {
      // Don't toggle if clicking directly on checkbox (it fires its own change)
      const i = parseInt(el.dataset.i, 10);
      g.settlement.tx[i].paid = !g.settlement.tx[i].paid;
      setGame(g);
      openSettlement(g);
    });
  }

  document.getElementById('share-btn')?.addEventListener('click', () => {
    const lines = [`💰 Settlement for "${g.name}"`, ''];
    tx.forEach(t => {
      lines.push(`${getUser(t.from)?.name} pays ${getUser(t.to)?.name}: ${state.currency}${fmt(t.amount)}`);
    });
    if (!tx.length) lines.push('Everyone broke even. 🤝');
    lines.push('', '— Sent from Poker Night');
    const waUrl = `https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`;
    window.open(waUrl, '_blank', 'noopener');
  });

  document.getElementById('done-btn').addEventListener('click', () => {
    state.currentGameId = null;
    save();
    setTab('home');
  });
}

function openGameSummary(g) {
  // Re-use settlement view for ended games
  if (!g.settlement) g.settlement = computeSettlement(g);
  setGame(g);
  openSettlement(g);
}

// ----------------------- History -----------------------

function renderHistory() {
  const ended = Object.values(state.games).filter(g => g.status === 'ended').sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0));

  // Compute my P&L across all games
  const myPnl = ended.reduce((s, g) => {
    const p = g.players[state.me.id];
    return s + (p ? playerNet(p) : 0);
  }, 0);
  const myGames = ended.filter(g => g.players[state.me.id]).length;

  $view.innerHTML = `
    <div class="view-header">
      <div>
        <h1>History</h1>
        <div class="sub">Your past games</div>
      </div>
    </div>

    <div class="float-bar">
      <div class="stat">
        <div class="v">${myGames}</div>
        <div class="l">Games</div>
      </div>
      <div class="stat ${myPnl >= 0 ? 'good' : 'bad'}">
        <div class="v">${myPnl >= 0 ? '+' : '−'}${state.currency}${fmt(Math.abs(myPnl))}</div>
        <div class="l">Lifetime P&amp;L</div>
      </div>
      <div class="stat">
        <div class="v">${Object.keys(state.users).length}</div>
        <div class="l">Players</div>
      </div>
    </div>

    ${ended.length === 0 ? `
      <div class="empty"><div class="big">📜</div><div>No finished games yet.</div></div>
    ` : ended.map(g => {
      const p = g.players[state.me.id];
      const myNet = p ? playerNet(p) : 0;
      return `
        <div class="game-item" data-id="${g.id}">
          <div>
            <div class="strong">${escape(g.name)}</div>
            <div class="meta">${fmtDate(g.endedAt || g.startedAt || g.date)} · ${Object.keys(g.players).length} players</div>
          </div>
          <div class="right">
            ${p ? `<div class="net ${myNet >= 0 ? 'pos' : 'neg'}">${myNet >= 0 ? '+' : '−'}${state.currency}${fmt(Math.abs(myNet))}</div>` : '<span class="muted">—</span>'}
          </div>
        </div>
      `;
    }).join('')}
  `;

  for (const el of $view.querySelectorAll('.game-item')) {
    el.addEventListener('click', () => {
      const g = getGame(el.dataset.id);
      if (g) openGameSummary(g);
    });
  }
}

// ----------------------- Leaderboard -----------------------

function renderLeaderboard() {
  const ended = Object.values(state.games).filter(g => g.status === 'ended');

  // Aggregate per-user stats across all ended games
  const agg = {}; // userId -> { userId, games, pnl, biggestWin, wins }
  for (const g of ended) {
    for (const p of Object.values(g.players)) {
      const net = playerNet(p);
      if (!agg[p.userId]) agg[p.userId] = { userId: p.userId, games: 0, pnl: 0, biggestWin: 0, wins: 0 };
      const a = agg[p.userId];
      a.games++;
      a.pnl += net;
      if (net > a.biggestWin) a.biggestWin = net;
      if (net > 0) a.wins++;
    }
  }

  const rows = Object.values(agg).sort((a, b) => b.pnl - a.pnl);

  $view.innerHTML = `
    <div class="view-header">
      <div>
        <h1>Leaderboard</h1>
        <div class="sub">Ranked by total P&amp;L</div>
      </div>
    </div>

    ${rows.length === 0 ? `
      <div class="empty"><div class="big">🏆</div><div>Finish a game to populate the leaderboard.</div></div>
    ` : rows.map((r, i) => {
      const u = getUser(r.userId);
      const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
      const winRate = r.games > 0 ? Math.round((r.wins / r.games) * 100) : 0;
      return `
        <div class="lb-row">
          <div class="rank ${rankClass}">${i + 1}</div>
          <div class="avatar">${escape(initials(u?.name || '?'))}</div>
          <div class="who">
            ${escape(u?.name || 'Unknown')}${u?.id === state.me.id ? ' <span class="muted" style="font-size:11px;">· You</span>' : ''}
            <div class="played">${r.games} games · ${winRate}% win rate · best ${state.currency}${fmt(r.biggestWin)}</div>
          </div>
          <div class="pnl ${r.pnl >= 0 ? 'pos' : 'neg'}">${r.pnl >= 0 ? '+' : '−'}${state.currency}${fmt(Math.abs(r.pnl))}</div>
        </div>
      `;
    }).join('')}
  `;
}

// ----------------------- Profile -----------------------

function renderProfile() {
  const myGames = Object.values(state.games).filter(g => g.status === 'ended' && g.players[state.me.id]);
  const pnl = myGames.reduce((s, g) => s + playerNet(g.players[state.me.id]), 0);

  $view.innerHTML = `
    <div class="view-header">
      <div>
        <h1>Profile</h1>
        <div class="sub">Account & stats</div>
      </div>
    </div>

    <div class="card elevated" style="display:flex;align-items:center;gap:14px;">
      <div class="avatar" style="width:56px;height:56px;font-size:20px;">${escape(initials(state.me.name))}</div>
      <div>
        <div class="strong" style="font-size:17px;">${escape(state.me.name)}</div>
        <div class="muted" style="font-size:13px;">${escape(state.me.phone || '')}</div>
      </div>
    </div>

    <div class="float-bar">
      <div class="stat">
        <div class="v">${myGames.length}</div>
        <div class="l">Games</div>
      </div>
      <div class="stat ${pnl >= 0 ? 'good' : 'bad'}">
        <div class="v">${pnl >= 0 ? '+' : '−'}${state.currency}${fmt(Math.abs(pnl))}</div>
        <div class="l">P&amp;L</div>
      </div>
      <div class="stat">
        <div class="v">${state.currency}</div>
        <div class="l">Currency</div>
      </div>
    </div>

    <div class="card">
      <h3>Settings</h3>
      <div class="field mt-8">
        <label for="pr-name">Display name</label>
        <input id="pr-name" value="${escape(state.me.name)}" />
      </div>
      <div class="field">
        <label for="pr-phone">Phone</label>
        <input id="pr-phone" value="${escape(state.me.phone || '')}" inputmode="tel" />
      </div>
      <div class="field">
        <label for="pr-cur">Currency symbol</label>
        <input id="pr-cur" value="${escape(state.currency)}" maxlength="3" />
      </div>
      <button class="btn primary" id="pr-save">Save</button>
    </div>

    <div class="card">
      <h3>Data</h3>
      <button class="btn ghost mt-8" id="export-btn">Export All Data (JSON)</button>
      <button class="btn danger mt-8" id="reset-btn">Reset All Data</button>
    </div>

    <div class="muted center" style="font-size:12px;margin-top:16px;">Poker Night v1.0 · Local-only data</div>
  `;

  document.getElementById('pr-save').addEventListener('click', () => {
    state.me.name = document.getElementById('pr-name').value.trim() || state.me.name;
    state.me.phone = document.getElementById('pr-phone').value.trim();
    state.currency = document.getElementById('pr-cur').value.trim() || '£';
    state.users[state.me.id] = state.me;
    save();
    toast('Saved', 'success');
    render();
  });

  document.getElementById('export-btn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `poker-night-export-${Date.now()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  });

  document.getElementById('reset-btn').addEventListener('click', () => {
    if (!confirm('Reset ALL data? This cannot be undone.')) return;
    localStorage.removeItem(STORAGE_KEY);
    state = defaultState();
    render();
  });
}

// ----------------------- Sheets & Toasts -----------------------

const $sheetRoot = document.getElementById('sheet-root');

function openSheet(html) {
  $sheetRoot.innerHTML = `
    <div class="sheet-overlay" role="dialog" aria-modal="true">
      <div class="sheet">
        <div class="grab"></div>
        ${html}
      </div>
    </div>
  `;
  const overlay = $sheetRoot.querySelector('.sheet-overlay');
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeSheet(); });
}
function closeSheet() { $sheetRoot.innerHTML = ''; }

function toast(msg, type = '') {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .2s ease'; }, 2200);
  setTimeout(() => el.remove(), 2600);
}

function haptic() {
  if (navigator.vibrate) navigator.vibrate(10);
}

// ----------------------- Helpers -----------------------

function fmt(n) {
  const num = Number(n) || 0;
  if (Number.isInteger(num)) return num.toString();
  return num.toFixed(2);
}
function fmtDate(d) {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d + 'T12:00:00') : new Date(d);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
function todayISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function escape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ----------------------- Init -----------------------

window.addEventListener('hashchange', render);
render();
