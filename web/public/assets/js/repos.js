/* Hx — repo list (the view BEFORE a repo page). Everything dynamic via window.Hx.
 * Patients see the threads they own + controls to create/scope. Providers see only
 * the records shared with them. Nothing hardcoded. */
(function () {
  var grid = document.getElementById('repo-grid');
  var headerActions = document.getElementById('header-actions');
  var whoSlot = document.getElementById('who-slot');
  var searchInput = document.getElementById('repo-search');

  var state = { user: null, repos: [], filter: '' };

  function initial(name) {
    var n = (name || '').trim();
    if (!n) return '?';
    // Provider org-style names ("Mercy General ER") -> initials of significant words.
    var parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2 && parts[parts.length - 1].length <= 3 && /^[A-Z]+$/.test(parts[parts.length - 1])) {
      return parts[parts.length - 1].slice(0, 2);
    }
    return n[0].toUpperCase();
  }

  function ownerHandle(user, repo) {
    // owner login is patient-side; for the patient themselves derive a github-y handle
    // from their display name; for providers we only know the repo ownerId.
    if (user && repo.ownerId === user.id && user.role === 'patient') {
      return (user.displayName || '').toLowerCase().replace(/\s+/g, '-') || 'you';
    }
    // patient owns all seeded repos; show a generic patient handle
    return String(repo.ownerId || 'patient').toLowerCase().replace(/\s+/g, '-');
  }

  function fillAppbarUser(user) {
    var av = document.getElementById('user-av');
    var name = document.getElementById('user-name');
    var role = document.getElementById('user-role');
    if (av) av.textContent = initial(user.displayName);
    if (name) name.textContent = user.displayName || 'You';
    if (role) {
      role.textContent = user.role === 'provider'
        ? (user.providerRole ? user.providerRole : 'Provider') + (user.org ? ' · ' + user.org : '')
        : 'Patient';
    }
  }

  function setHeaderCopy(user) {
    var eyebrow = document.getElementById('repos-eyebrow');
    var title = document.getElementById('repos-title');
    var sub = document.getElementById('repos-sub');
    if (user.role === 'provider') {
      if (eyebrow) eyebrow.textContent = 'Shared with you';
      if (title) title.textContent = 'Records shared with you';
      if (sub) sub.textContent = 'You only see the threads a patient has granted you access to. Open one to view or add a visit.';
    } else {
      if (eyebrow) eyebrow.textContent = 'Your records';
      if (title) title.textContent = 'Your health, as repositories';
      if (sub) sub.textContent = 'Each thread of visits is its own repo. Open one to see the full history.';
    }
  }

  function renderHeaderActions(user) {
    if (!headerActions) return;
    headerActions.innerHTML = '';
    if (user.role !== 'patient') return;

    var manage = document.createElement('a');
    manage.href = 'scoping.html';
    manage.className = 'btn btn-ghost';
    manage.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:17px;height:17px"><path d="M12 1a3 3 0 0 0-3 3v1.1A7 7 0 0 0 5 11v3l-1.6 2.4A1 1 0 0 0 4.2 18h15.6a1 1 0 0 0 .8-1.6L19 14"/><path d="M3 3l18 18"/></svg> Manage who can see your data';

    var create = document.createElement('button');
    create.className = 'btn btn-accent';
    create.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="width:17px;height:17px"><path d="M12 5v14M5 12h14"/></svg> New thread';
    create.addEventListener('click', createThread);

    headerActions.appendChild(manage);
    headerActions.appendChild(create);
  }

  function renderWhoBanner(user) {
    if (!whoSlot) return;
    whoSlot.innerHTML = '';
    if (user.role !== 'patient') return;
    var b = document.createElement('div');
    b.className = 'who-banner';
    b.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>' +
      '<div><b>You decide who sees what.</b><p>Grant a doctor access to a single thread, or revoke it anytime.</p></div>' +
      '<a href="scoping.html" class="btn btn-primary btn-sm">Manage access</a>';
    whoSlot.appendChild(b);
  }

  function accessPill(user, repo) {
    // Patient owns the repo -> "Private · yours". Provider -> granted access level.
    var owns = user.role === 'patient' && repo.ownerId === user.id;
    if (owns) return { text: 'Private · yours', cls: 'vis-pill' };
    var lvl = repo.access === 'write' ? 'Can add visits' : 'Read-only';
    return { text: 'Shared · ' + lvl, cls: 'vis-pill' };
  }

  function repoCard(user, repo) {
    var a = document.createElement('a');
    a.className = 'repo-card';
    a.href = 'app.html?repo=' + encodeURIComponent(repo.id);

    var pill = accessPill(user, repo);
    var owner = ownerHandle(user, repo);
    var visits = typeof repo.visitCount === 'number' ? repo.visitCount : 0;
    var visitsLabel = visits + (visits === 1 ? ' visit' : ' visits');

    a.innerHTML =
      '<div class="rc-top">' +
        '<span class="rc-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>' +
        '<span class="rc-path"><span class="owner">' + Hx.esc(owner) + '</span><span class="slash"> / </span><span class="name">' + Hx.esc(repo.name) + '</span></span>' +
        '<span class="' + pill.cls + '" style="margin-left:auto">' + Hx.esc(pill.text) + '</span>' +
      '</div>' +
      '<div class="rc-desc">' + Hx.esc(repo.description || 'No description yet.') + '</div>' +
      '<div class="rc-meta">' +
        '<span class="m"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M3 12h6M15 12h6"/></svg> ' + visitsLabel + ' committed</span>' +
        '<span class="m"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg> Open record</span>' +
      '</div>';
    return a;
  }

  function renderEmpty(user) {
    var isProvider = user.role === 'provider';
    var div = document.createElement('div');
    div.className = 'empty';
    if (isProvider) {
      div.innerHTML =
        '<div class="em-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9"/></svg></div>' +
        '<h3>Nothing shared with you yet</h3>' +
        '<p>When a patient grants you access to one of their threads, it will show up here.</p>';
    } else {
      div.innerHTML =
        '<div class="em-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg></div>' +
        '<h3>No records yet</h3>' +
        '<p>Start your first thread — like “Primary Care” or “Mental Health” — and every visit becomes a version.</p>' +
        '<button class="btn btn-accent em-cta" id="empty-create"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="width:17px;height:17px"><path d="M12 5v14M5 12h14"/></svg> New thread</button>';
    }
    return div;
  }

  function renderError(message) {
    var div = document.createElement('div');
    div.className = 'empty';
    div.innerHTML =
      '<div class="em-ico" style="color:var(--danger-600)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg></div>' +
      '<h3>Could not load your records</h3>' +
      '<p>' + Hx.esc(message || 'Something went wrong.') + '</p>' +
      '<button class="btn btn-ghost em-cta" id="retry-load">Try again</button>';
    return div;
  }

  function renderList() {
    if (!grid) return;
    grid.innerHTML = '';
    var user = state.user;
    var filter = state.filter.trim().toLowerCase();
    var items = state.repos.filter(function (r) {
      if (!filter) return true;
      return ((r.name || '') + ' ' + (r.description || '')).toLowerCase().indexOf(filter) !== -1;
    });

    if (!state.repos.length) {
      var empty = renderEmpty(user);
      grid.appendChild(empty);
      var ec = document.getElementById('empty-create');
      if (ec) ec.addEventListener('click', createThread);
      return;
    }

    if (!items.length) {
      var none = document.createElement('div');
      none.className = 'empty';
      none.innerHTML = '<h3>No matching records</h3><p>No threads match “' + Hx.esc(state.filter) + '”.</p>';
      grid.appendChild(none);
      return;
    }

    items.forEach(function (r) { grid.appendChild(repoCard(user, r)); });
  }

  function createThread() {
    var name = window.prompt('Name your new thread (e.g. “Cardiology” or “Mental Health”):');
    if (name == null) return;
    name = name.trim();
    if (!name) return;
    var description = window.prompt('A short description (optional):') || '';

    // No Hx method for create — POST /api/repos directly (same-origin, cookie session).
    fetch('/api/repos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, description: description.trim() })
    })
      .then(function (r) {
        if (r.status === 401) { location.href = 'login.html'; return null; }
        return r.json().then(function (body) {
          if (!r.ok) throw new Error((body && body.error) || 'Could not create thread');
          return body;
        });
      })
      .then(function (body) {
        if (body && body.repo && body.repo.id) {
          location.href = 'app.html?repo=' + encodeURIComponent(body.repo.id);
        }
      })
      .catch(function (err) {
        window.alert(err && err.message ? err.message : 'Could not create thread.');
      });
  }

  function loadRepos() {
    if (grid) {
      grid.innerHTML = '<div class="skeleton"><div class="sk-card"></div><div class="sk-card"></div><div class="sk-card"></div><div class="sk-card"></div></div>';
    }
    return Hx.repos()
      .then(function (repos) {
        state.repos = repos || [];
        renderList();
      })
      .catch(function (err) {
        if (err && err.status === 401) { location.href = 'login.html'; return; }
        grid.innerHTML = '';
        var e = renderError(err && err.message);
        grid.appendChild(e);
        var retry = document.getElementById('retry-load');
        if (retry) retry.addEventListener('click', loadRepos);
      });
  }

  // ---- wiring ----
  var signout = document.getElementById('signout');
  if (signout) {
    signout.addEventListener('click', function () {
      Hx.logout().then(function () { location.href = 'index.html'; }).catch(function () { location.href = 'index.html'; });
    });
  }
  if (searchInput) {
    searchInput.addEventListener('input', function () { state.filter = searchInput.value || ''; renderList(); });
  }

  Hx.requireSession()
    .then(function (user) {
      state.user = user;
      fillAppbarUser(user);
      setHeaderCopy(user);
      renderHeaderActions(user);
      renderWhoBanner(user);
      return loadRepos();
    })
    .catch(function () { /* requireSession already redirects on 401 */ });
})();
