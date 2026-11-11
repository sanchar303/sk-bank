'use strict';

(() => {
  const bank = window.skBank;
  const databaseURL = window.skBankConfig.databaseURL.replace(/\/$/, '');
  const el = (selector) => document.querySelector(selector);
  const state = {
    authenticated: false, busy: false, failures: 0, lockedUntil: 0,
    requests: {}, globalRequests: {}, locks: {}, historyRefs: new Map(),
    globalRef: null, lockRef: null, filter: 'all', busyIds: new Set(),
    toastTimer: null, idleTimer: null, confirmResolve: null, users: []
  };

  const money = (value) => '$' + (Number(value) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const roundBalance = (value) => Math.round((Number(value) + Number.EPSILON) * 1e8) / 1e8;
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const hash = async (username, password) => {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`skb|${username}|${password}`));
    return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  };
  const dateText = (value) => {
    const timestamp = Number(value) || 0;
    if (!timestamp) return '—';
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  };

  function haptic(pattern = 'tap') {
    try {
      if (localStorage.getItem('skb-haptics') === 'off' || !navigator.vibrate) return;
      const patterns = { tap: 8, success: [10, 40, 14], error: [28, 36, 28] };
      navigator.vibrate(patterns[pattern] || patterns.tap);
    } catch (_) { /* Optional device feature. */ }
  }

  function toast(message, type = 'info', duration = 2100) {
    el('#toastMessage').textContent = message;
    el('#toast').className = `toast ${type}`;
    void el('#toast').offsetWidth;
    el('#toast').classList.add('show');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => el('#toast').classList.remove('show'), duration);
    if (type === 'success') haptic('success');
    else if (type === 'error') haptic('error');
  }

  function applyTheme(theme) {
    const next = theme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('skb-theme', next); } catch (_) { /* Storage may be disabled. */ }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = next === 'light' ? '#e9eff9' : '#060a14';
    el('#themeToggle').classList.toggle('active', next === 'light');
    el('#themeToggle').setAttribute('aria-label', next === 'light' ? 'Switch to dark mode' : 'Switch to light mode');
  }

  function renderPreferences() {
    let enabled = true;
    try { enabled = localStorage.getItem('skb-haptics') !== 'off'; } catch (_) { /* Storage may be disabled. */ }
    el('#hapticToggle').classList.toggle('active', enabled);
    el('#hapticToggle').setAttribute('aria-label', enabled ? 'Turn haptic feedback off' : 'Turn haptic feedback on');
    el('#themeToggle').classList.toggle('active', document.documentElement.dataset.theme === 'light');
  }

  function activate(element, callback) {
    element.addEventListener('click', (event) => { haptic('tap'); callback(event); });
    element.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        haptic('tap');
        callback(event);
      }
    });
  }

  function askConfirm(title, message, actionLabel) {
    return new Promise((resolve) => {
      state.confirmResolve = resolve;
      el('#confirmTitle').textContent = title;
      el('#confirmText').textContent = message;
      el('#acceptConfirm').textContent = actionLabel;
      el('#confirmModal').classList.remove('hidden');
      el('#acceptConfirm').focus();
    });
  }

  function closeConfirm(result) {
    if (el('#confirmModal').classList.contains('hidden')) return;
    el('#confirmModal').classList.add('hidden');
    const resolve = state.confirmResolve;
    state.confirmResolve = null;
    if (resolve) resolve(Boolean(result));
  }

  function setLoginBusy(busy) {
    state.busy = busy;
    el('#adminLoginButton').classList.toggle('loading', busy);
    el('#adminLoginButton').setAttribute('aria-disabled', String(busy));
    el('#adminLoginButton').querySelector('span').textContent = busy ? 'Signing in…' : 'Sign in';
  }

  async function authenticate(event) {
    event.preventDefault();
    if (state.busy) return;
    if (Date.now() < state.lockedUntil) return toast('Try again in a minute.', 'error');
    const password = el('#adminPassword').value;
    const pin = el('#adminPin').value;
    if (!password || !/^\d{4,6}$/.test(pin)) return toast('Enter password and PIN.', 'error');

    setLoginBusy(true);
    try {
      const [passwordHash, pinHash] = await Promise.all([hash('admin', password), hash('pin:admin', pin)]);
      const snapshot = await bank.child('users/admin').once('value');
      const admin = snapshot.val();
      if (!admin || admin.role !== 'admin' || admin.ph !== passwordHash || admin.pinHash !== pinHash) {
        state.failures += 1;
        if (state.failures >= 5) {
          state.failures = 0;
          state.lockedUntil = Date.now() + 60000;
        }
        throw new Error('Incorrect sign-in details.');
      }
      state.failures = 0;
      state.authenticated = true;
      el('#adminPassword').value = '';
      el('#adminPin').value = '';
      el('#adminLogin').classList.add('hidden');
      el('#adminDashboard').classList.remove('hidden');
      startIdleTimer();
      await startListeners();
      haptic('success');
    } catch (error) {
      console.error('Admin sign-in failed:', error);
      toast(error.message || 'Could not sign in.', 'error', 2500);
    } finally {
      setLoginBusy(false);
    }
  }

  function touchSession() {
    if (!state.authenticated) return;
    clearTimeout(state.idleTimer);
    state.idleTimer = setTimeout(() => logout(true), 10 * 60 * 1000);
  }

  function startIdleTimer() {
    ['click', 'keydown', 'pointerdown', 'touchstart'].forEach((eventName) => {
      document.addEventListener(eventName, touchSession, { passive: true });
    });
    touchSession();
  }

  function stopIdleTimer() {
    clearTimeout(state.idleTimer);
    ['click', 'keydown', 'pointerdown', 'touchstart'].forEach((eventName) => {
      document.removeEventListener(eventName, touchSession);
    });
  }

  async function getUsernames() {
    const response = await fetch(`${databaseURL}/sk-bank/users.json?shallow=true`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Account directory unavailable (${response.status}).`);
    const data = await response.json();
    if (data && data.error) throw new Error(data.error);
    return Object.keys(data || {}).map((value) => value.toLowerCase())
      .filter((value) => /^[a-z0-9_]{3,20}$/.test(value) && value !== 'admin').sort();
  }

  function clearListeners() {
    state.historyRefs.forEach(({ ref, handler }) => ref.off('value', handler));
    state.historyRefs.clear();
    if (state.globalRef && state.globalHandler) state.globalRef.off('value', state.globalHandler);
    if (state.lockRef && state.lockHandler) state.lockRef.off('value', state.lockHandler);
    state.globalRef = state.globalHandler = state.lockRef = state.lockHandler = null;
  }

  async function startListeners() {
    clearListeners();
    state.requests = {};
    state.globalRequests = {};
    state.locks = {};
    try {
      state.users = await getUsernames();
    } catch (error) {
      console.error('Could not load account keys:', error);
      try {
        const snapshot = await bank.child('network').once('value');
        state.users = Object.keys(snapshot.val() || {}).filter((username) => username !== 'admin');
        toast('Some accounts may not appear.', 'info');
      } catch (fallbackError) {
        console.error('Could not load the account directory:', fallbackError);
        el('#requestSummary').textContent = 'Accounts unavailable.';
        toast('Could not load accounts.', 'error');
        state.users = [];
      }
    }

    state.users.forEach((username) => {
      const ref = bank.child(`users/${username}/withdrawals`);
      const handler = (snapshot) => {
        state.requests[username] = snapshot.val() || {};
        renderRequests();
      };
      ref.on('value', handler, (error) => {
        console.error(`Could not load requests for ${username}:`, error);
        el('#requestSummary').textContent = 'Some records unavailable.';
      });
      state.historyRefs.set(username, { ref, handler });
    });

    state.globalRef = bank.child('withdrawals');
    state.globalHandler = (snapshot) => {
      state.globalRequests = snapshot.val() || {};
      renderRequests();
    };
    state.globalRef.on('value', state.globalHandler, (error) => {
      console.warn('Global withdrawal index unavailable:', error);
    });

    state.lockRef = bank.child('pendingWithdrawals');
    state.lockHandler = (snapshot) => {
      state.locks = snapshot.val() || {};
      renderRequests();
    };
    state.lockRef.on('value', state.lockHandler, (error) => {
      console.warn('Legacy pending locks unavailable:', error);
    });
    renderRequests();
  }

  function collectRequests() {
    const byId = new Map();
    Object.entries(state.globalRequests || {}).forEach(([id, request]) => {
      if (!request || !request.username) return;
      byId.set(id, {
        ...request,
        id: request.id || id,
        username: String(request.username).toLowerCase(),
        requestedAt: Number(request.requestedAt || request.ts || 0)
      });
    });

    Object.entries(state.locks || {}).forEach(([username, lock]) => {
      if (!lock || typeof lock !== 'object' || !lock.id || byId.has(lock.id)) return;
      byId.set(lock.id, {
        id: lock.id, username, name: username, amount: Number(lock.amount) || 0,
        status: 'pending', requestedAt: Number(lock.ts || lock.requestedAt || 0), legacyOrphan: true
      });
    });

    Object.entries(state.requests || {}).forEach(([username, records]) => {
      Object.entries(records || {}).forEach(([id, request]) => {
        if (!request) return;
        const existing = byId.get(id) || {};
        byId.set(id, {
          ...existing,
          ...request,
          id: request.id || id,
          username: String(request.username || username).toLowerCase(),
          requestedAt: Number(request.requestedAt || request.ts || existing.requestedAt || 0)
        });
      });
    });

    return [...byId.values()].sort((a, b) => Number(b.requestedAt || 0) - Number(a.requestedAt || 0));
  }

  function renderRequests() {
    const requests = collectRequests();
    const pending = requests.filter((request) => request.status === 'pending');
    const approved = requests.filter((request) => request.status === 'approved');
    const declined = requests.filter((request) => request.status === 'declined');
    el('#pendingCount').textContent = String(pending.length);
    el('#approvedCount').textContent = String(approved.length);
    el('#declinedCount').textContent = String(declined.length);
    el('#requestSummary').textContent = `${requests.length} total · ${pending.length} pending`;

    const query = el('#searchInput').value.trim().toLowerCase();
    const visible = requests.filter((request) => {
      const statusMatch = state.filter === 'all' || request.status === state.filter;
      const searchable = `${request.username} ${request.name || ''} ${request.id}`.toLowerCase();
      return statusMatch && (!query || searchable.includes(query));
    });
    const list = el('#requestList');
    if (!visible.length) {
      list.innerHTML = '<div class="empty-state"><b>No requests</b></div>';
      return;
    }

    list.innerHTML = visible.map((request) => {
      const status = ['pending', 'approved', 'declined'].includes(request.status) ? request.status : 'pending';
      const username = escapeHtml(request.username);
      const name = escapeHtml(request.name || request.username);
      const id = escapeHtml(request.id);
      const busy = state.busyIds.has(request.id);
      const actions = status === 'pending'
        ? `<div class="row-actions"><div class="row-button approve" role="button" tabindex="0" data-action="approve" data-user="${username}" data-id="${id}" aria-disabled="${busy}">${busy ? 'Saving…' : 'Approve'}</div><div class="row-button decline" role="button" tabindex="0" data-action="decline" data-user="${username}" data-id="${id}" aria-disabled="${busy}">Decline</div></div>`
        : `<div class="row-actions"><span class="status-chip ${status}">${status}</span></div>`;
      return `<article class="request-row">
        <div class="request-user"><span class="user-avatar">${escapeHtml((request.username || '?').slice(0, 1).toUpperCase())}</span><div><b>${name}</b><small>@${username}</small></div></div>
        <div class="request-amount"><b>${money(request.amount)}</b><small>Requested</small></div>
        <div class="request-meta"><span class="status-chip ${status}">${status}</span><small>${dateText(request.requestedAt)}</small><small>ID: ${id}</small></div>
        ${actions}
      </article>`;
    }).join('');
  }

  async function decide(username, requestId, decision) {
    if (!state.authenticated || state.busyIds.has(requestId)) return;
    const record = collectRequests().find((request) => request.id === requestId && request.username === username);
    if (!record || record.status !== 'pending') return toast('Request already handled.', 'info');
    const approved = decision === 'approved';
    const confirmText = approved
      ? `Approve ${money(record.amount)} for @${username}?`
      : `Decline ${money(record.amount)} for @${username}? The amount will be refunded.`;
    if (!await askConfirm(approved ? 'Approve request' : 'Decline request', confirmText, approved ? 'Approve' : 'Decline')) return;

    state.busyIds.add(requestId);
    renderRequests();
    try {
      const accountRef = bank.child(`users/${username}`);
      const accountSnapshot = await accountRef.once('value');
      const knownAccount = accountSnapshot.val();
      if (!knownAccount || typeof knownAccount !== 'object') throw new Error('Account record unavailable.');
      let abortReason = '';
      let firstTransactionRun = true;
      let decidedRecord = null;
      const result = await accountRef.transaction((current) => {
        if (!current && firstTransactionRun) current = JSON.parse(JSON.stringify(knownAccount));
        firstTransactionRun = false;
        abortReason = '';
        if (!current || typeof current !== 'object') { abortReason = 'Account record unavailable.'; return; }
        const requests = current.withdrawals && typeof current.withdrawals === 'object' ? current.withdrawals : {};
        const oldRequest = requests[requestId] || state.globalRequests[requestId] || record;
        if (!oldRequest || oldRequest.status !== 'pending') { abortReason = 'Request already processed.'; return; }
        const amount = Number(oldRequest.amount);
        if (!Number.isFinite(amount) || amount <= 0) { abortReason = 'Request amount is invalid.'; return; }
        const updated = { ...oldRequest, id: requestId, username, amount, status: decision, decidedAt: Date.now(), decidedBy: 'admin' };
        if (!approved) {
          current.main = roundBalance((Number(current.main) || 0) + amount);
          updated.refundedAt = Date.now();
        }
        current.withdrawals = requests;
        current.withdrawals[requestId] = updated;
        if (current.withdrawalPendingId === requestId) current.withdrawalPendingId = null;
        decidedRecord = updated;
        return current;
      }, undefined, false);

      if (!result.committed) {
        const latest = result.snapshot && result.snapshot.val();
        if (latest && latest.withdrawals && latest.withdrawals[requestId] && latest.withdrawals[requestId].status !== 'pending') {
          throw new Error('Request already processed.');
        }
        throw new Error(abortReason || 'Firebase rejected the decision.');
      }

      // Keep older top-level request records and legacy locks synchronized when present.
      const withdrawalEntry = {
        id: requestId, ts: Number(record.requestedAt || record.ts || decidedRecord.decidedAt),
        type: 'withdrawal', from: username, to: 'SK Bank Withdrawal',
        fromName: decidedRecord.name || username, toName: 'Withdrawal',
        amt: Number(record.amount), tax: 0, net: Number(record.amount),
        note: approved ? 'Withdrawal approved' : 'Withdrawal declined · refunded'
      };
      const rootUpdates = {
        [`ledger/${requestId}`]: withdrawalEntry,
        [`userTx/${username}/${requestId}`]: withdrawalEntry
      };
      if (state.globalRequests[requestId] || record.legacyOrphan) {
        rootUpdates[`withdrawals/${requestId}`] = decidedRecord;
      }
      let oldLock = state.locks[username];
      if (!oldLock) {
        try { oldLock = (await bank.child(`pendingWithdrawals/${username}`).once('value')).val(); }
        catch (lockError) { console.warn('Could not verify a legacy lock:', lockError); }
      }
      if (oldLock && (oldLock.id === requestId || oldLock === requestId)) rootUpdates[`pendingWithdrawals/${username}`] = null;
      if (!approved) {
        const refundId = `R${requestId}`;
        const refundEntry = {
          id: refundId, ts: decidedRecord.decidedAt, type: 'withdrawal',
          from: 'SK Bank Withdrawal', to: username, fromName: 'Withdrawal refund',
          toName: decidedRecord.name || username, amt: Number(record.amount), tax: 0,
          net: Number(record.amount), note: 'Declined · refunded'
        };
        rootUpdates[`ledger/${refundId}`] = refundEntry;
        rootUpdates[`userTx/${username}/${refundId}`] = refundEntry;
      }
      if (Object.keys(rootUpdates).length) {
        try { await bank.update(rootUpdates); }
        catch (syncError) { console.warn('Decision saved; a secondary index could not be updated:', syncError); }
      }

      // Older Claude requests tracked a separate withdrawal hold. New records do not.
      const oldClaudeRecord = Boolean(record.legacyOrphan || (state.globalRequests[requestId] &&
        !state.globalRequests[requestId].source && !state.globalRequests[requestId].requestedAt &&
        !state.globalRequests[requestId].balanceBefore));
      if (oldClaudeRecord) {
        try {
          await bank.child('vault/withdrawalHold').transaction((value) => Math.max(0, roundBalance((Number(value) || 0) - Number(record.amount || 0))));
          if (approved) {
            await bank.update({
              'vault/minted': firebase.database.ServerValue.increment(-Number(record.amount || 0)),
              'stats/withdrawn': firebase.database.ServerValue.increment(Number(record.amount || 0))
            });
          }
        } catch (legacyAccountingError) { console.warn('Legacy withdrawal accounting could not sync:', legacyAccountingError); }
      }

      if (!approved) {
        try {
          const networkRef = bank.child(`network/${username}`);
          const networkSnapshot = await networkRef.once('value');
          if (networkSnapshot.exists()) await networkRef.child('nw').transaction((value) => roundBalance((Number(value) || 0) + Number(record.amount || 0)));
        } catch (networkError) { console.warn('Refund saved; network total did not sync:', networkError); }
      }
      try {
        await bank.child(`notes/${username}`).push({
          ts: decidedRecord.decidedAt, cat: 'system',
          title: approved ? 'Withdrawal approved' : 'Withdrawal declined',
          msg: approved ? `${money(record.amount)} withdrawal approved.` : `${money(record.amount)} returned to your balance.`,
          read: false
        });
      } catch (noteError) { console.warn('Decision saved; notification failed:', noteError); }
      try {
        await bank.child('audit').push({
          ts: decidedRecord.decidedAt, actor: 'admin', target: username,
          mode: 'admin', action: approved ? 'withdrawal approved' : 'withdrawal declined',
          detail: money(record.amount)
        });
      } catch (auditError) { console.warn('Decision saved; audit entry failed:', auditError); }

      if (state.requests[username]) state.requests[username][requestId] = decidedRecord;
      if (state.globalRequests[requestId]) state.globalRequests[requestId] = decidedRecord;
      toast(approved ? 'Approved.' : 'Declined. Refunded.', 'success');
    } catch (error) {
      console.error('Unable to decide withdrawal request:', error);
      toast(error.message || 'Could not update request.', 'error', 2500);
    } finally {
      state.busyIds.delete(requestId);
      renderRequests();
    }
  }

  function setFilterMenu(open) {
    el('#filterMenu').classList.toggle('hidden', !open);
    el('#filterTrigger').setAttribute('aria-expanded', String(Boolean(open)));
  }

  function setFilter(filter) {
    state.filter = filter;
    const labels = { all: 'All', pending: 'Pending', approved: 'Approved', declined: 'Declined' };
    el('#filterLabel').textContent = labels[filter] || 'All';
    el('#filterMenu').querySelectorAll('[data-filter]').forEach((option) => {
      option.classList.toggle('selected', option.dataset.filter === filter);
      option.setAttribute('aria-selected', String(option.dataset.filter === filter));
    });
    setFilterMenu(false);
    renderRequests();
  }

  function logout(fromIdle = false) {
    state.authenticated = false;
    stopIdleTimer();
    clearListeners();
    state.requests = {};
    state.globalRequests = {};
    state.locks = {};
    state.busyIds.clear();
    el('#adminDashboard').classList.add('hidden');
    el('#adminLogin').classList.remove('hidden');
    el('#adminPassword').value = '';
    el('#adminPin').value = '';
    if (fromIdle) toast('Session locked.', 'info');
  }

  function bindUI() {
    el('#adminLoginForm').addEventListener('submit', authenticate);
    el('#adminLoginForm').addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && event.target.tagName === 'INPUT') {
        event.preventDefault();
        el('#adminLoginForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      }
    });
    el('#adminLoginButton').addEventListener('click', (event) => {
      event.preventDefault();
      el('#adminLoginForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    el('#adminPin').addEventListener('input', (event) => { event.target.value = event.target.value.replace(/\D/g, '').slice(0, 6); });

    el('#requestList').addEventListener('click', (event) => {
      const control = event.target.closest('[data-action]');
      if (!control || control.getAttribute('aria-disabled') === 'true') return;
      haptic('tap');
      decide(control.dataset.user, control.dataset.id, control.dataset.action === 'approve' ? 'approved' : 'declined');
    });
    el('#requestList').addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const control = event.target.closest('[data-action]');
      if (!control) return;
      event.preventDefault();
      control.click();
    });
    activate(el('#filterTrigger'), () => setFilterMenu(el('#filterMenu').classList.contains('hidden')));
    el('#filterMenu').addEventListener('click', (event) => {
      const option = event.target.closest('[data-filter]');
      if (option) setFilter(option.dataset.filter);
    });
    el('#filterMenu').addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        const option = event.target.closest('[data-filter]');
        if (option) { event.preventDefault(); setFilter(option.dataset.filter); }
      }
    });
    document.addEventListener('click', (event) => {
      if (!el('#filterWrap').contains(event.target)) setFilterMenu(false);
    });
    el('#searchInput').addEventListener('input', renderRequests);
    activate(el('#refreshButton'), async () => {
      if (!state.authenticated) return;
      toast('Refreshing…', 'info');
      await startListeners();
      toast('Updated.', 'success');
      touchSession();
    });
    activate(el('#logoutButton'), () => logout(false));
    activate(el('#cancelConfirm'), () => closeConfirm(false));
    activate(el('#acceptConfirm'), () => closeConfirm(true));
    el('#confirmModal').addEventListener('click', (event) => {
      if (event.target === el('#confirmModal')) closeConfirm(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { closeConfirm(false); setFilterMenu(false); }
    });
    activate(el('#themeToggle'), () => applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'));
    activate(el('#hapticToggle'), () => {
      const enabled = localStorage.getItem('skb-haptics') !== 'off';
      try { localStorage.setItem('skb-haptics', enabled ? 'off' : 'on'); } catch (_) { /* Storage may be disabled. */ }
      renderPreferences();
      if (!enabled) haptic('success');
    });
    activate(el('#backToBank'), () => { window.location.assign('/'); });
  }

  applyTheme(document.documentElement.dataset.theme || 'dark');
  renderPreferences();
  bindUI();
  window.addEventListener('pagehide', () => {
    stopIdleTimer();
    clearListeners();
    clearTimeout(state.toastTimer);
  });
})();
