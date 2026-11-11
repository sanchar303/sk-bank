'use strict';

(() => {
  const bank = window.skBank;
  const databaseURL = window.skBankConfig.databaseURL.replace(/\/$/, '');
  const el = (selector) => document.querySelector(selector);
  const state = {
    users: [], roles: {}, pendingIds: {}, accountPending: {}, legacyLocks: {}, checks: {}, globalPending: {},
    globalWithdrawals: {}, selected: '', balance: 0, balanceKnown: false, pendingId: null,
    mainRef: null, mainHandler: null, pendingRef: null, pendingHandler: null,
    frozenRef: null, frozenHandler: null, listeners: new Map(), busy: false,
    toastTimer: null, menuOpen: false, lastRequestId: null, credentialFailures: 0, credentialsLockedUntil: 0
  };

  const money = (value) => '$' + (Number(value) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const roundBalance = (value) => Math.round((Number(value) + Number.EPSILON) * 1e8) / 1e8;
  const maxWithdrawable = (value) => {
    const balance = Number(value);
    if (!Number.isFinite(balance) || balance <= 0) return 0;
    // Main-bank balances are maintained to 8 decimal places. Convert to that
    // integer precision first, then round DOWN to whole cents.
    const precisionUnits = Math.round(balance * 1e8);
    return Math.floor(precisionUnits / 1e6) / 100;
  };
  const isUsername = (value) => /^[a-z0-9_]{3,20}$/.test(value);
  const hash = async (username, password) => {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`skb|${username}|${password}`));
    return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  };

  function haptic(pattern = 'tap') {
    try {
      if (localStorage.getItem('skb-haptics') === 'off' || !navigator.vibrate) return;
      const patterns = { tap: 8, success: [10, 40, 14], error: [28, 36, 28] };
      navigator.vibrate(patterns[pattern] || patterns.tap);
    } catch (_) { /* Optional device feature. */ }
  }

  function toast(message, type = 'info', duration = 2100) {
    const node = el('#toast');
    el('#toastMessage').textContent = message;
    node.className = `toast ${type}`;
    void node.offsetWidth;
    node.classList.add('show');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => node.classList.remove('show'), duration);
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

  function setHidden(selector, hidden) {
    el(selector).classList.toggle('hidden', Boolean(hidden));
  }

  function pendingFor(username) {
    return Boolean(
      state.pendingIds[username] || state.accountPending[username] ||
      state.legacyLocks[username] || state.globalPending[username]
    );
  }

  function selectLabel(username) {
    const label = el('#selectedUsername');
    label.textContent = username ? `@${username}` : 'Select a bank username';
    label.classList.toggle('placeholder', !username);
  }

  function setPickerOpen(open) {
    state.menuOpen = Boolean(open);
    el('#accountPicker').classList.toggle('open', state.menuOpen);
    setHidden('#accountOptions', !state.menuOpen);
    el('#usernameSelect').setAttribute('aria-expanded', String(state.menuOpen));
    if (state.menuOpen) setTimeout(() => el('#accountSearch').focus(), 0);
  }

  function renderDirectory() {
    const query = el('#accountSearch').value.trim().toLowerCase();
    const list = el('#accountOptionList');
    list.replaceChildren();
    const usernames = state.users.filter((username) => {
      if (username === 'admin' || state.roles[username] === 'admin') return false;
      return !query || username.includes(query);
    });

    if (!usernames.length) {
      const empty = document.createElement('div');
      empty.className = 'account-option-empty';
      empty.textContent = state.users.length ? 'No matching users' : 'No accounts found';
      list.appendChild(empty);
      return;
    }

    usernames.forEach((username) => {
      const checks = state.checks[username] || {};
      const pending = pendingFor(username);
      const unavailable = !checks.role || !checks.pendingId || !checks.history || !checks.legacy || state.roles[username] === 'unknown' || state.pendingIds[username] === 'unknown';
      const option = document.createElement('div');
      option.className = `account-option${pending || unavailable ? ' disabled' : ''}`;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-disabled', String(pending || unavailable));
      option.setAttribute('aria-selected', String(state.selected === username));
      option.tabIndex = pending || unavailable ? -1 : 0;
      option.dataset.username = username;

      const name = document.createElement('span');
      name.className = 'option-name';
      name.textContent = `@${username}`;
      option.appendChild(name);

      if (pending || unavailable) {
        const status = document.createElement('span');
        status.className = 'option-state';
        status.textContent = pending ? 'Pending' : 'Checking';
        option.appendChild(status);
      }
      list.appendChild(option);
    });
  }

  async function getUsernames() {
    const response = await fetch(`${databaseURL}/sk-bank/users.json?shallow=true`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Directory request failed (${response.status}).`);
    const data = await response.json();
    if (data && data.error) throw new Error(data.error);
    return Object.keys(data || {}).map((value) => value.toLowerCase()).filter((value) => isUsername(value) && value !== 'admin').sort();
  }

  async function refreshDirectory() {
    try {
      state.users = await getUsernames();
      syncUserListeners();
      renderDirectory();
      el('#directoryHint').textContent = '';
    } catch (error) {
      console.error('Could not load account directory:', error);
      try {
        const snapshot = await bank.child('network').once('value');
        const network = snapshot.val() || {};
        state.users = [...new Set(Object.entries(network)
          .map(([key, value]) => String(value && value.u || key).toLowerCase())
          .filter((username) => isUsername(username) && username !== 'admin'))].sort();
        syncUserListeners();
        renderDirectory();
        el('#directoryHint').textContent = 'Some accounts may not appear.';
        if (!state.users.length) toast('Could not load accounts.', 'error');
      } catch (fallbackError) {
        console.error('Account directory fallback failed:', fallbackError);
        el('#directoryHint').textContent = 'Accounts unavailable';
        toast('Could not load accounts.', 'error');
      }
    }
  }

  function removeUserListeners(username, record) {
    Object.values(record).forEach((item) => {
      if (item && item.ref && item.handler) item.ref.off('value', item.handler);
    });
    state.listeners.delete(username);
    delete state.roles[username];
    delete state.pendingIds[username];
    delete state.accountPending[username];
    delete state.legacyLocks[username];
    delete state.checks[username];
  }

  function syncUserListeners() {
    const valid = new Set(state.users);
    for (const [username, record] of state.listeners.entries()) {
      if (!valid.has(username)) removeUserListeners(username, record);
    }

    state.users.forEach((username) => {
      if (state.listeners.has(username)) return;
      state.roles[username] = null;
      state.pendingIds[username] = null;
      state.accountPending[username] = null;
      state.legacyLocks[username] = null;
      state.checks[username] = { role: false, pendingId: false, history: false, legacy: false };
      const record = {};

      const attach = (key, path, callback) => {
        const ref = bank.child(path);
        const handler = (snapshot) => callback(snapshot);
        ref.on('value', handler, (error) => {
          console.error(`Could not read ${path}:`, error);
          callback(null, error);
        });
        record[key] = { ref, handler };
      };

      attach('role', `users/${username}/role`, (snapshot, error) => {
        state.roles[username] = error ? 'unknown' : (snapshot && snapshot.exists() ? snapshot.val() : 'user');
        state.checks[username].role = !error;
        if (state.selected === username && state.roles[username] === 'admin') {
          unbindSelected();
          state.selected = '';
          resetPanels();
          selectLabel('');
        }
        renderDirectory();
      });
      attach('pendingId', `users/${username}/withdrawalPendingId`, (snapshot, error) => {
        state.pendingIds[username] = error ? 'unknown' : (snapshot && snapshot.val() || null);
        state.checks[username].pendingId = !error;
        renderDirectory();
        if (state.selected === username) applySelectedState();
      });
      attach('history', `users/${username}/withdrawals`, (snapshot, error) => {
        if (error) state.accountPending[username] = true;
        else state.accountPending[username] = Object.values(snapshot && snapshot.val() || {}).some((request) => request && request.status === 'pending');
        state.checks[username].history = true;
        renderDirectory();
        if (state.selected === username) applySelectedState();
      });
      attach('legacyLock', `pendingWithdrawals/${username}`, (snapshot, error) => {
        state.legacyLocks[username] = error ? false : Boolean(snapshot && snapshot.exists() && snapshot.val());
        state.checks[username].legacy = true;
        renderDirectory();
        if (state.selected === username) applySelectedState();
      });
      state.listeners.set(username, record);
    });
  }

  function updateGlobalPending(raw) {
    state.globalWithdrawals = raw || {};
    const next = {};
    Object.values(state.globalWithdrawals).forEach((request) => {
      if (request && request.status === 'pending' && request.username) next[String(request.username).toLowerCase()] = true;
    });
    state.globalPending = next;
    renderDirectory();
    if (state.selected) applySelectedState();
  }

  function unbindSelected() {
    if (state.mainRef && state.mainHandler) state.mainRef.off('value', state.mainHandler);
    if (state.pendingRef && state.pendingHandler) state.pendingRef.off('value', state.pendingHandler);
    if (state.frozenRef && state.frozenHandler) state.frozenRef.off('value', state.frozenHandler);
    state.mainRef = state.pendingRef = state.frozenRef = null;
    state.mainHandler = state.pendingHandler = state.frozenHandler = null;
  }

  function resetPanels() {
    setHidden('#balancePanel', true);
    setHidden('#pendingPanel', true);
    setHidden('#withdrawalForm', true);
    setHidden('#successPanel', true);
    state.balance = 0;
    state.balanceKnown = false;
    state.pendingId = null;
    el('#balanceValue').textContent = '$—';
    el('#balanceUser').textContent = '@username';
    el('#balanceUpdated').textContent = '—';
    el('#balanceMeter').style.width = '100%';
    el('#amountInput').value = '';
    el('#passwordInput').value = '';
    el('#pinInput').value = '';
    el('#amountInput').disabled = false;
    el('#amountInput').placeholder = '0.00';
    el('#submitButton').classList.remove('disabled', 'loading');
    el('#submitButton').querySelector('span').textContent = 'Submit request';
    el('#withdrawalForm').dataset.frozen = 'false';
  }

  function selectAccount(username) {
    setPickerOpen(false);
    unbindSelected();
    state.selected = username;
    resetPanels();
    selectLabel(username);
    renderDirectory();
    if (!username) return;
    if (!state.users.includes(username) || state.roles[username] === 'admin' || state.roles[username] === 'unknown') {
      toast('Account unavailable.', 'error');
      state.selected = '';
      selectLabel('');
      return;
    }

    el('#balanceUser').textContent = `@${username}`;
    setHidden('#balancePanel', false);
    el('#balanceUpdated').textContent = 'Connecting…';

    state.mainRef = bank.child(`users/${username}/main`);
    state.mainHandler = (snapshot) => {
      const raw = snapshot.val();
      state.balanceKnown = snapshot.exists() && raw !== null && Number.isFinite(Number(raw));
      state.balance = state.balanceKnown ? Number(raw) : 0;
      el('#balanceValue').textContent = state.balanceKnown ? money(state.balance) : '$—';
      el('#maxAmount').textContent = money(maxWithdrawable(state.balance));
      el('#balanceUpdated').textContent = state.balanceKnown
        ? `Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
        : 'Unavailable';
      el('#amountInput').max = String(maxWithdrawable(state.balance));
      updatePreview();
      applySelectedState();
    };
    state.mainRef.on('value', state.mainHandler, (error) => {
      console.error('Live balance listener failed:', error);
      state.balanceKnown = false;
      el('#balanceUpdated').textContent = 'Unavailable';
      toast('Could not read this balance.', 'error');
    });

    state.pendingRef = bank.child(`users/${username}/withdrawalPendingId`);
    state.pendingHandler = (snapshot) => {
      state.pendingId = snapshot.val() || null;
      state.pendingIds[username] = state.pendingId;
      renderDirectory();
      applySelectedState();
    };
    state.pendingRef.on('value', state.pendingHandler, (error) => {
      console.error('Pending status listener failed:', error);
      state.pendingIds[username] = 'unknown';
      applySelectedState();
      toast('Could not check request status.', 'error');
    });

    state.frozenRef = bank.child(`users/${username}/frozen`);
    state.frozenHandler = (snapshot) => {
      el('#withdrawalForm').dataset.frozen = snapshot.val() ? 'true' : 'false';
      applySelectedState();
    };
    state.frozenRef.on('value', state.frozenHandler, (error) => {
      console.error('Account status read failed:', error);
      el('#withdrawalForm').dataset.frozen = 'true';
      applySelectedState();
    });
  }

  function applySelectedState() {
    if (!state.selected) return;
    const pending = pendingFor(state.selected) || state.pendingId === 'unknown';
    const frozen = el('#withdrawalForm').dataset.frozen === 'true';
    if (frozen) {
      el('#pendingPanel').innerHTML = '<span class="pending-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg></span><div><b>Account restricted</b><p>Withdrawals unavailable.</p></div>';
    } else {
      el('#pendingPanel').innerHTML = '<span class="pending-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></span><div><b>Request pending</b><p>Awaiting review.</p></div>';
    }
    const completed = !el('#successPanel').classList.contains('hidden');
    setHidden('#pendingPanel', !(pending || frozen) || completed);
    setHidden('#withdrawalForm', pending || frozen || !state.balanceKnown || completed);
    if (state.balance <= 0) {
      el('#amountInput').value = '';
      el('#amountInput').disabled = true;
      el('#submitButton').classList.add('disabled');
      el('#amountInput').placeholder = 'No available balance';
    } else {
      el('#amountInput').disabled = false;
      el('#submitButton').classList.toggle('disabled', state.busy);
      el('#amountInput').placeholder = '0.00';
    }
  }

  function parseAmountCents(value) {
    const raw = String(value ?? '').trim();
    if (!raw || !/^\d+(?:\.\d{1,2})?$/.test(raw)) return null;
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    const cents = Math.round(amount * 100);
    return Number.isSafeInteger(cents) ? cents : null;
  }

  function updatePreview() {
    const cents = parseAmountCents(el('#amountInput').value);
    const amount = cents === null ? 0 : cents / 100;
    const valid = cents !== null && amount <= maxWithdrawable(state.balance) + 1e-9;
    el('#previewAmount').textContent = money(valid ? amount : 0);
    el('#deductionAmount').textContent = money(valid ? amount : 0);
    el('#balanceMeter').style.width = state.balance > 0 && valid
      ? `${Math.max(0, Math.min(100, amount / state.balance * 100))}%` : '100%';
  }

  function setBusy(busy) {
    state.busy = busy;
    const button = el('#submitButton');
    button.classList.toggle('loading', busy);
    button.classList.toggle('disabled', busy || state.balance <= 0);
    button.querySelector('span').textContent = busy ? 'Submitting…' : 'Submit request';
    if (!busy) applySelectedState();
  }

  function friendlyFirebaseError(error) {
    const code = String(error && error.code || '').toLowerCase();
    if (code.includes('permission')) return 'Firebase rules blocked this request.';
    if (code.includes('network')) return 'Connection lost. Try again.';
    return error && error.message ? error.message : 'Could not submit. Try again.';
  }

  async function submitRequest(event) {
    event.preventDefault();
    if (state.busy) return;
    if (Date.now() < state.credentialsLockedUntil) return toast('Try again in a minute.', 'error');
    const username = state.selected;
    if (!username) return toast('Select an account.', 'error');
    if (pendingFor(username)) return toast('This account has a pending request.', 'error');

    const cents = parseAmountCents(el('#amountInput').value);
    if (cents === null) return toast('Enter a valid amount.', 'error');
    const amount = cents / 100;
    const password = el('#passwordInput').value;
    const pin = el('#pinInput').value;
    if (!password) return toast('Enter the account password.', 'error');
    if (!/^\d{4,6}$/.test(pin)) return toast('Enter a valid transaction PIN.', 'error');
    if (!state.balanceKnown) return toast('Balance is unavailable.', 'error');
    if (amount > maxWithdrawable(state.balance)) return toast('Amount exceeds the balance.', 'error');

    setBusy(true);
    try {
      const [passwordHash, pinHash] = await Promise.all([
        hash(username, password), hash(`pin:${username}`, pin)
      ]);
      const accountRef = bank.child(`users/${username}`);
      const accountSnapshot = await accountRef.once('value');
      const knownAccount = accountSnapshot.val();
      if (!knownAccount || typeof knownAccount !== 'object') throw new Error('Account record not found. Refresh the page and select the account again.');
      if (knownAccount.role === 'admin') throw new Error('Administrator accounts cannot withdraw.');
      if (!knownAccount.pinHash) throw new Error('Set a transaction PIN in the Bank App first.');
      if (knownAccount.ph !== passwordHash || knownAccount.pinHash !== pinHash) {
        state.credentialFailures += 1;
        if (state.credentialFailures >= 5) {
          state.credentialFailures = 0;
          state.credentialsLockedUntil = Date.now() + 60000;
        }
        throw new Error(knownAccount.ph !== passwordHash ? 'Incorrect account password.' : 'Incorrect transaction PIN.');
      }
      state.credentialFailures = 0;
      if (knownAccount.frozen) throw new Error('This account is restricted.');
      try {
        const legacyLock = await bank.child(`pendingWithdrawals/${username}`).once('value');
        if (legacyLock.exists() && legacyLock.val()) throw new Error('This account has a pending request.');
      } catch (lockError) {
        if (lockError && lockError.message === 'This account has a pending request.') throw lockError;
        console.warn('Legacy pending-lock check unavailable:', lockError);
      }

      const requestId = accountRef.child('withdrawals').push().key;
      if (!requestId) throw new Error('Could not create the request. Try again.');
      const requestedAt = Date.now();
      let abortReason = '';
      let firstTransactionRun = true;
      const result = await accountRef.transaction((current) => {
        if (!current && firstTransactionRun) current = JSON.parse(JSON.stringify(knownAccount));
        firstTransactionRun = false;
        abortReason = '';
        if (!current || typeof current !== 'object') { abortReason = 'Account record not found.'; return; }
        if (current.role === 'admin') { abortReason = 'Administrator accounts cannot withdraw.'; return; }
        if (current.ph !== passwordHash) { abortReason = 'Account password changed. Try again.'; return; }
        if (current.pinHash !== pinHash) { abortReason = 'Transaction PIN changed. Try again.'; return; }
        if (current.frozen) { abortReason = 'This account is restricted.'; return; }
        if (current.withdrawalPendingId) { abortReason = 'This account has a pending request.'; return; }

        const requests = current.withdrawals && typeof current.withdrawals === 'object' ? current.withdrawals : {};
        if (Object.values(requests).some((request) => request && request.status === 'pending')) {
          abortReason = 'This account has a pending request.';
          return;
        }
        const currentBalance = Number(current.main);
        if (!Number.isFinite(currentBalance) || currentBalance < 0) { abortReason = 'Balance is unavailable.'; return; }
        if (amount > maxWithdrawable(currentBalance)) { abortReason = 'Balance changed. Enter a lower amount.'; return; }

        current.main = roundBalance(currentBalance - amount);
        current.withdrawalPendingId = requestId;
        current.withdrawals = requests;
        current.withdrawals[requestId] = {
          id: requestId,
          username,
          name: String(current.name || username),
          amount,
          balanceBefore: roundBalance(currentBalance),
          balanceAfter: current.main,
          status: 'pending',
          requestedAt,
          decidedAt: null,
          decidedBy: null
        };
        return current;
      }, undefined, false);

      if (!result.committed) {
        const latest = result.snapshot && result.snapshot.val();
        if (latest && latest.withdrawalPendingId) throw new Error('This account has a pending request.');
        if (latest && latest.frozen) throw new Error('This account is restricted.');
        if (latest && Number(latest.main) < amount) throw new Error('Balance changed. Enter a lower amount.');
        throw new Error(abortReason || 'Firebase rejected the update. Check database write rules.');
      }

      state.pendingIds[username] = requestId;
      state.accountPending[username] = true;
      state.pendingId = requestId;
      renderDirectory();

      const request = {
        id: requestId, username, name: String(knownAccount.name || username), amount,
        balanceBefore: roundBalance(Number(knownAccount.main)),
        balanceAfter: roundBalance(Number(knownAccount.main) - amount),
        status: 'pending', requestedAt, ts: requestedAt, source: 'account-transaction-v2', decidedAt: null, decidedBy: null
      };
      const tx = {
        id: requestId, ts: requestedAt, type: 'withdrawal', from: username,
        to: 'SK Bank Withdrawal', fromName: request.name, toName: 'Withdrawal',
        amt: amount, tax: 0, net: amount, note: 'Withdrawal request pending'
      };

      // These are secondary indexes. The account transaction above is the source of truth.
      try {
        await bank.update({
          [`withdrawals/${requestId}`]: request,
          [`ledger/${requestId}`]: tx,
          [`userTx/${username}/${requestId}`]: tx
        });
      } catch (indexError) {
        console.warn('Withdrawal saved; a secondary index could not be updated:', indexError);
      }
      try {
        const networkRef = bank.child(`network/${username}`);
        const networkSnapshot = await networkRef.once('value');
        if (networkSnapshot.exists()) await networkRef.child('nw').transaction((value) => roundBalance((Number(value) || 0) - amount));
      } catch (networkError) {
        console.warn('Withdrawal saved; network total did not sync:', networkError);
      }
      try {
        await bank.child(`notes/${username}`).push({
          ts: requestedAt, cat: 'system', title: 'Withdrawal requested',
          msg: `${money(amount)} is awaiting review.`, read: false
        });
      } catch (noteError) {
        console.warn('Withdrawal saved; notification did not send:', noteError);
      }

      state.lastRequestId = requestId;
      el('#successId').textContent = requestId;
      el('#successAmount').textContent = money(amount);
      el('#passwordInput').value = '';
      el('#pinInput').value = '';
      setHidden('#withdrawalForm', true);
      setHidden('#pendingPanel', true);
      setHidden('#successPanel', false);
      toast('Request submitted.', 'success');
    } catch (error) {
      console.error('Withdrawal submission failed:', error);
      toast(friendlyFirebaseError(error), 'error', 2600);
    } finally {
      setBusy(false);
    }
  }

  function submitForm() {
    el('#withdrawalForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
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

  function bindUI() {
    activate(el('#usernameSelect'), () => setPickerOpen(!state.menuOpen));
    el('#usernameSelect').addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setPickerOpen(true);
      } else if (event.key === 'Escape') {
        setPickerOpen(false);
      }
    });
    el('#accountSearch').addEventListener('input', renderDirectory);
    el('#accountOptionList').addEventListener('click', (event) => {
      const option = event.target.closest('[data-username]');
      if (!option || option.getAttribute('aria-disabled') === 'true') return;
      haptic('tap');
      setHidden('#successPanel', true);
      selectAccount(option.dataset.username);
    });
    el('#accountOptionList').addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const options = [...el('#accountOptionList').querySelectorAll('[data-username]:not(.disabled)')];
        const index = options.indexOf(document.activeElement);
        const step = event.key === 'ArrowDown' ? 1 : -1;
        options[(index + step + options.length) % options.length]?.focus();
        return;
      }
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const option = event.target.closest('[data-username]');
      if (option && option.getAttribute('aria-disabled') !== 'true') {
        event.preventDefault();
        option.click();
      }
    });
    document.addEventListener('click', (event) => {
      if (!el('#accountPicker').contains(event.target)) setPickerOpen(false);
    });
    el('#withdrawalForm').addEventListener('submit', submitRequest);
    el('#withdrawalForm').addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && event.target.tagName === 'INPUT') {
        event.preventDefault();
        submitForm();
      }
    });
    el('#amountInput').addEventListener('input', updatePreview);
    activate(el('#maxButton'), () => {
      if (!state.selected || !state.balanceKnown) return toast('Select an account.', 'info');
      el('#amountInput').value = maxWithdrawable(state.balance).toFixed(2);
      updatePreview();
    });
    activate(el('#submitButton'), submitForm);
    activate(el('#newRequestButton'), () => {
      unbindSelected();
      state.selected = '';
      resetPanels();
      selectLabel('');
      renderDirectory();
      el('#usernameSelect').focus();
    });
    document.querySelectorAll('[data-toggle-password]').forEach((control) => {
      activate(control, () => {
        const input = document.getElementById(control.dataset.togglePassword);
        input.type = input.type === 'password' ? 'text' : 'password';
        control.setAttribute('aria-label', input.type === 'password' ? 'Show password' : 'Hide password');
      });
    });
    el('#pinInput').addEventListener('input', (event) => { event.target.value = event.target.value.replace(/\D/g, '').slice(0, 6); });

    activate(el('#themeToggle'), () => applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'));
    activate(el('#hapticToggle'), () => {
      const enabled = localStorage.getItem('skb-haptics') !== 'off';
      try { localStorage.setItem('skb-haptics', enabled ? 'off' : 'on'); } catch (_) { /* Storage may be disabled. */ }
      renderPreferences();
      if (!enabled) haptic('success');
    });
    activate(el('#backToBank'), () => { window.location.assign('/index'); });
  }

  function cleanup() {
    unbindSelected();
    state.listeners.forEach((record, username) => removeUserListeners(username, record));
    bank.child('withdrawals').off('value', globalWithdrawalsHandler);
    clearInterval(state.directoryTimer);
    clearTimeout(state.toastTimer);
  }

  const globalWithdrawalsHandler = (snapshot) => updateGlobalPending(snapshot.val());

  applyTheme(document.documentElement.dataset.theme || 'dark');
  renderPreferences();
  bindUI();
  bank.child('withdrawals').on('value', globalWithdrawalsHandler, (error) => console.warn('Global request index unavailable:', error));
  refreshDirectory();
  state.directoryTimer = setInterval(refreshDirectory, 60000);
  window.addEventListener('pagehide', cleanup);
})();
