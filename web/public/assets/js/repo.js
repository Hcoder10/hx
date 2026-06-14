/* Hx repo (thread) page. Everything is loaded from the API via window.Hx —
 * nothing on this page is hardcoded. Requires hx-api.js to be loaded first. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = Hx.esc;
  var fmt = Hx.fmtDate;

  // ---- markdown helpers -----------------------------------------------------
  // The section files look like:  "# Medications\n\n- name dose — for reason\n..."
  // or "_none recorded_" when empty. Return the list of "- " bullet lines.
  function bullets(md) {
    if (!md) return [];
    return String(md)
      .split('\n')
      .map(function (l) { return l.trim(); })
      .filter(function (l) { return l.indexOf('- ') === 0; })
      .map(function (l) { return l.slice(2).trim(); })
      .filter(Boolean);
  }

  // Parse a medications bullet "lisinopril 10 mg — for high blood pressure"
  // into {name, dose, reason}. Robust to missing dose/reason.
  function parseMed(line) {
    var reason = '';
    var head = line;
    var emIdx = line.indexOf('—');
    if (emIdx >= 0) {
      head = line.slice(0, emIdx).trim();
      reason = line.slice(emIdx + 1).replace(/^for\s+/i, '').trim();
    }
    var parts = head.split(/\s+/);
    var name = parts.shift() || head;
    var dose = parts.join(' ');
    return { name: name, dose: dose, reason: reason };
  }

  function slug(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  }

  // ---- state ----------------------------------------------------------------
  var user, id, repoData, filesData, alertsData;
  var SECTION_LABEL = { medications: 'Medications', problems: 'Problems', allergies: 'Allergies', plan: 'Care plan' };

  // No read endpoint exposes per-visit notes, so we remember the content of any
  // visit committed during THIS session (from the Add-visit form OR the voice
  // agent, which also calls Hx.addVisit). Keyed by the server's visit id scheme:
  // `${date}-${slug(title)}`. This makes voice-logged symptoms appear in the
  // Timeline immediately. Survives within the page session.
  var sessionVisits = {};
  function rememberVisit(body) {
    if (!body || !body.title) return;
    var date = (body.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) ? body.date : '2026-06-13';
    var key = date + '-' + slug(body.title.trim() || 'visit-update');
    sessionVisits[key] = {
      summary: body.summary || '',
      notes: Array.isArray(body.notes) ? body.notes : [],
      addMedications: body.addMedications || [],
      addProblems: body.addProblems || [],
    };
  }

  function ownerHandle() {
    // The owner of the repo. If the session user owns it, use their handle;
    // otherwise fall back to the ownerId (a stable slug).
    var oid = repoData && repoData.repo && repoData.repo.ownerId;
    if (user && oid === user.id) {
      return (user.username && user.username.split('@')[0]) || user.displayName || oid;
    }
    return oid || 'patient';
  }
  function isOwner() {
    return !!(user && repoData && repoData.repo && repoData.repo.ownerId === user.id);
  }

  // ---- header / repo identity ----------------------------------------------
  function renderHeader() {
    var r = repoData.repo || {};
    $('repoOwner').textContent = ownerHandle();
    $('repoName').textContent = r.name || id;
    $('repoVis').textContent = isOwner() ? 'Private · yours' : 'Private · shared with you';
    document.title = ownerHandle() + ' / ' + (r.name || id) + ' · Hx';
    $('aboutDesc').textContent = r.description || 'A thread of visits. Only you and the people you allow can see it.';
    var av = $('userAvatar');
    if (av && user) { av.textContent = (user.displayName || '?').charAt(0).toUpperCase(); av.title = user.displayName; }
  }

  // ---- file list (Timeline tab top) ----------------------------------------
  function latestShort() {
    var log = (repoData && repoData.log) || [];
    return log[0] ? log[0].shortOid : '';
  }
  function renderFileList() {
    var log = (repoData && repoData.log) || [];
    var f = (filesData && filesData.files) || {};
    var top = log[0];
    var short = latestShort();
    var enc = '<div class="file-row">' +
      '<svg class="fico folder" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>' +
      '<span class="fname">encounters/</span>' +
      '<span class="fmsg">' + log.length + ' visit' + (log.length === 1 ? '' : 's') + ' recorded</span>' +
      '<span class="fage">' + (top ? fmt(top.date) : '') + '</span></div>';

    function fileRow(name, md) {
      var n = bullets(md).length;
      var msg = n ? (n + ' item' + (n === 1 ? '' : 's') + ' recorded') : 'none recorded yet';
      return '<div class="file-row">' +
        '<svg class="fico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>' +
        '<span class="fname">' + name + '</span>' +
        '<span class="fmsg">' + esc(msg) + (short ? ' <span class="hash">' + esc(short) + '</span>' : '') + '</span>' +
        '<span class="fage">' + (top ? fmt(top.date) : '') + '</span></div>';
    }

    var headHtml = top
      ? '<div class="fl-head"><span class="av av-mono" style="width:22px;height:22px;background:linear-gradient(135deg,var(--blue-400),var(--blue-600))">' +
          esc((top.authorName || '?').charAt(0).toUpperCase()) + '</span>' +
          '<b>' + esc(top.authorName) + '</b>&nbsp;<span>committed the latest visit — “' + esc(top.message.split('—')[0].trim()) + '”</span>' +
          '<span class="age mono">' + esc(top.shortOid) + ' · ' + fmt(top.date) + '</span></div>'
      : '<div class="fl-head"><span>No visits committed yet</span></div>';

    $('fileList').innerHTML = headHtml +
      fileRow('medications.md', f.medications) +
      fileRow('problems.md', f.problems) +
      fileRow('allergies.md', f.allergies) +
      enc;
  }

  // ---- timeline (commit log) -----------------------------------------------
  // Resolve a commit to any per-visit content we remembered this session. The
  // server's commit message is "Title — Place" and the visit id is
  // `${date}-${slug(title)}`, so we can reconstruct the key from the log entry.
  function visitForCommit(c) {
    var title = c.message.split('—')[0].trim();
    var date = (c.date || '').slice(0, 10);
    return sessionVisits[date + '-' + slug(title)] || null;
  }
  function renderTimeline() {
    var log = (repoData && repoData.log) || [];
    var el = $('timeline');
    if (!log.length) { el.innerHTML = '<div class="hx-empty">No visits yet. Use “Add visit” to make your first commit.</div>'; return; }
    el.innerHTML = log.map(function (c, i) {
      var title = c.message.split('—')[0].trim();
      var v = visitForCommit(c);
      var notes = (v && v.notes) || [];
      var summary = (v && v.summary) || '';
      var notesHtml = notes.map(function (n) {
        var neg = /^reports NOT:/i.test(n);
        return '<li' + (neg ? ' class="neg"' : '') + '>' + esc(n) + '</li>';
      }).join('');
      var place = (c.message.indexOf('—') >= 0) ? c.message.split('—').slice(1).join('—').trim() : '';
      var body = (summary || notesHtml)
        ? '<div class="tl-body">' +
            (summary ? '<div class="sum">' + esc(summary) + '</div>' : '') +
            (notesHtml ? '<ul class="tl-notes">' + notesHtml + '</ul>' : '') +
          '</div>'
        : '<div class="tl-body"><div class="sum">' + esc(place ? 'Recorded at ' + place + '.' : c.message) + '</div></div>';
      return '<div class="tl-item" data-i="' + i + '">' +
        '<div class="tl-head">' +
          '<span class="tl-dot">' + esc((c.authorName || '?').charAt(0).toUpperCase()) + '</span>' +
          '<div class="tl-main"><b>' + esc(title) + '</b><span>committed by ' + esc(c.authorName) + '</span></div>' +
          '<div class="tl-meta"><span class="sha">' + esc(c.shortOid) + '</span><span class="when">' + fmt(c.date) + '</span></div>' +
        '</div>' + body + '</div>';
    }).join('');
    Array.prototype.forEach.call(el.querySelectorAll('.tl-head'), function (h) {
      h.addEventListener('click', function () { h.parentNode.classList.toggle('open'); });
    });
  }

  // ---- files tab ------------------------------------------------------------
  function renderFilesTab() {
    var f = (filesData && filesData.files) || {};
    var plan = filesData && filesData.plan;
    var sections = [
      ['medications', f.medications],
      ['problems', f.problems],
      ['allergies', f.allergies],
    ];
    if (plan) sections.push(['plan', plan]);
    var html = sections.map(function (s) {
      var key = s[0], md = s[1] || '';
      var n = bullets(md).length;
      var fileName = key === 'plan' ? 'plan.md' : key + '.md';
      var body = n ? esc(md) : '_none recorded yet_';
      return '<div class="filecard">' +
        '<div class="filecard-head"><svg class="fico" viewBox="0 0 24 24" fill="none" stroke="var(--ink-400)" stroke-width="2" style="width:16px;height:16px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>' +
        '<span class="fn">' + esc(fileName) + '</span>' +
        '<a class="dl" href="' + esc(Hx.exportUrl(id, key)) + '" download><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg> Download</a></div>' +
        '<pre>' + body + '</pre></div>';
    }).join('');
    html += '<div style="display:flex;justify-content:flex-end;margin-top:4px">' +
      '<a class="btn btn-ghost btn-sm" href="' + esc(Hx.exportUrl(id)) + '" download>Export all</a></div>';
    $('filesBody').innerHTML = html;
  }

  // ---- codes tab ------------------------------------------------------------
  function renderCodes(coded) {
    var body = $('codesBody');
    var entries = (coded && coded.entries) || [];
    if (!entries.length) {
      body.innerHTML = '<div class="hx-empty">No coded entries yet. As visits are committed, their terms are mapped to standard codes and verified here.</div>';
      return;
    }
    var groups = {};
    entries.forEach(function (e) {
      var sec = e.section || 'other';
      (groups[sec] = groups[sec] || []).push(e);
    });
    body.innerHTML = Object.keys(groups).map(function (sec) {
      var rows = groups[sec].map(function (e) {
        var ok = e.accepted;
        var codeCell = e.code
          ? '<span class="code">' + esc(e.code) + '</span> <span class="sys">' + esc(e.system || '') + '</span>'
          : '<span class="sys">unmapped</span>';
        return '<tr>' +
          '<td class="term">' + esc(e.term || '') + '</td>' +
          '<td>' + codeCell + '</td>' +
          '<td>' + esc(e.matchedDescription || '') + '</td>' +
          '<td>' + (ok ? '<span class="code-ok">✓ verified</span>' : '<span class="code-flag">⚑ flagged</span>') + '</td>' +
          '</tr>';
      }).join('');
      return '<div class="codes-grp"><h4>' + esc(SECTION_LABEL[sec] || sec) + '</h4>' +
        '<table class="codes-table"><thead><tr><th>Term</th><th>Code</th><th>Matched description</th><th>Status</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
    }).join('');
  }

  // ---- README summary + at-a-glance + "since last visit" --------------------
  function renderReadme(meds, conditions, careTeam, alerts) {
    var topCond = conditions.slice(0, 2).map(function (c) { return '<b>' + esc(c) + '</b>'; }).join(' and ');
    var log = (repoData && repoData.log) || [];
    var last = log[0];
    var summary = '';
    if (topCond) summary += 'You are managing ' + topCond + '. ';
    if (last) summary += 'Your most recent visit was “' + esc(last.message.split('—')[0].trim()) + '” on ' + fmt(last.date) + ', recorded by ' + esc(last.authorName) + '.';
    if (!summary) summary = 'This thread has no visits yet. Add one to start your record.';
    $('readmeSummary').innerHTML = summary || '—';

    $('statMeds').textContent = meds.length;
    $('statConditions').textContent = conditions.length;
    $('statCareTeam').textContent = careTeam.length;
    $('statSafety').textContent = alerts.length;

    // Since last visit: the meds/problems/allergies added on the latest commit's date.
    var since = [];
    var flagged = {};
    (alerts || []).forEach(function (a) { (a.involved || []).forEach(function (i) { flagged[(i.name || '').split(' ')[0].toLowerCase()] = true; }); });
    if (last) {
      meds.forEach(function (m) {
        since.push('<li><svg viewBox="0 0 24 24" fill="none" stroke="var(--green-600)" stroke-width="2.4"><path d="M20 6 9 17l-5-5"/></svg><span><b style="color:var(--ink-900)">Medicine</b> ' + esc(m.name) + (m.dose ? ' ' + esc(m.dose) : '') + (m.reason ? ' — for ' + esc(m.reason) : '') + '</span></li>');
      });
    }
    if ((alerts || []).length) {
      var a0 = alerts[0];
      since.push('<li><svg viewBox="0 0 24 24" fill="none" stroke="var(--danger-600)" stroke-width="2.2"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg><span><b style="color:var(--danger-700)">Heads-up</b> — ' + esc(a0.summary || a0.title) + ' <a href="safety.html" style="color:var(--blue-600);font-weight:600">See what to do →</a></span></li>');
    }
    $('sinceList').innerHTML = since.length ? since.slice(0, 5).join('') : '<li><span style="color:var(--ink-400)">Nothing new since your last visit.</span></li>';
  }

  // ---- sidebar: conditions / care team / medicines --------------------------
  function renderSidebar(meds, conditions, careTeam, flaggedNames) {
    var dots = ['var(--danger-500,#d8453b)', 'var(--blue-500)', 'var(--green-500)', 'var(--blue-600)'];
    $('conditionsList').innerHTML = conditions.length
      ? conditions.map(function (c, i) { return '<span class="topic"><span class="d" style="background:' + dots[i % dots.length] + '"></span>' + esc(c) + '</span>'; }).join('')
      : '<span style="color:var(--ink-400);font-size:.85rem">None recorded</span>';

    $('careTeamList').innerHTML = careTeam.length
      ? careTeam.map(function (t) {
          return '<div class="team-row"><span class="av-mono" style="background:linear-gradient(135deg,var(--blue-400),var(--blue-600))">' +
            esc((t.name || '?').charAt(0).toUpperCase()) + '</span><div><b>' + esc(t.name) + '</b><span>' + esc(t.role || 'Provider') + '</span></div></div>';
        }).join('')
      : '<span style="color:var(--ink-400);font-size:.85rem">No providers yet</span>';

    $('medsList').innerHTML = meds.length
      ? meds.map(function (m) {
          var flag = flaggedNames[m.name.toLowerCase()];
          return '<div class="meds-line"><span class="md' + (flag ? ' flag' : '') + '"></span><b>' + esc(m.name) + '</b>&nbsp;<span class="dose">' + esc(m.dose) + '</span>' +
            (m.reason ? '<span class="by">' + esc(m.reason) + '</span>' : '') + '</div>';
        }).join('')
      : '<span style="color:var(--ink-400);font-size:.85rem">No medicines recorded</span>';
  }

  // ---- safety banner --------------------------------------------------------
  function renderSafety(alerts) {
    var top = alerts[0];
    var banner = $('safetyBanner');
    if (top) {
      $('bannerTitle').textContent = top.title || 'Possible medication safety issue';
      var meds = (top.involved || []).map(function (i) { return i.name; }).join(' + ');
      var provs = (top.involved || []).map(function (i) { return i.provider; }).filter(Boolean);
      var uniqProvs = provs.filter(function (p, i) { return provs.indexOf(p) === i; });
      $('bannerSummary').textContent = (meds ? meds : top.summary || '') + (uniqProvs.length ? ' — ' + uniqProvs.join(', ') : '');
      banner.style.display = '';
    } else {
      banner.style.display = 'none';
    }
    $('tabSafetyNum').textContent = alerts.length;
    $('safetyTab').style.display = alerts.length ? '' : 'none';
    var nd = $('ndot');
    if (alerts.length) { nd.textContent = String(alerts.length); nd.style.display = ''; }
    else nd.style.display = 'none';
  }

  // ---- tabs -----------------------------------------------------------------
  function setupTabs() {
    var tabs = document.querySelectorAll('.repo-tabs a[data-tab]');
    Array.prototype.forEach.call(tabs, function (t) {
      t.addEventListener('click', function (e) {
        e.preventDefault();
        Array.prototype.forEach.call(tabs, function (x) { x.classList.remove('active'); });
        t.classList.add('active');
        var name = t.getAttribute('data-tab');
        ['timeline', 'files', 'codes'].forEach(function (p) {
          var panel = $('panel-' + p);
          if (panel) panel.classList.toggle('active', p === name);
        });
        // README only makes sense alongside the timeline.
        $('panel-readme').classList.toggle('active', name === 'timeline');
      });
    });
  }

  // ---- add visit ------------------------------------------------------------
  function setupAddVisit() {
    var form = $('addVisitForm');
    var toggle = $('addVisitToggle');
    toggle.addEventListener('click', function (e) {
      e.preventDefault();
      form.style.display = form.style.display === 'none' ? '' : 'none';
      if (form.style.display !== 'none') $('avTitle').focus();
    });
    $('avCancel').addEventListener('click', function () { form.style.display = 'none'; });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = $('avMsg'); msg.className = 'hx-form-msg'; msg.textContent = '';
      var title = $('avTitle').value.trim();
      if (!title) { msg.className = 'hx-form-msg err'; msg.textContent = 'Title is required.'; return; }
      var body = { title: title, summary: $('avSummary').value.trim() };
      var d = $('avDate').value; if (d) body.date = d;
      var notes = $('avNotes').value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
      if (notes.length) body.notes = notes;
      var medName = $('avMedName').value.trim();
      if (medName) body.addMedications = [{ name: medName, dose: $('avMedDose').value.trim(), reason: $('avMedReason').value.trim() }];
      var prob = $('avProblem').value.trim();
      if (prob) body.addProblems = [{ name: prob }];

      var btn = $('avSubmit'); btn.disabled = true; btn.textContent = 'Committing…';
      // Hx.addVisit is wrapped at boot to remember notes + refresh the page.
      Hx.addVisit(id, body).then(function () {
        form.reset(); form.style.display = 'none';
        msg.className = 'hx-form-msg ok'; msg.textContent = 'Committed.';
      }).catch(function (err) {
        msg.className = 'hx-form-msg err'; msg.textContent = (err && err.message) || 'Could not commit.';
      }).then(function () {
        btn.disabled = false; btn.textContent = 'Commit visit';
      });
    });
  }

  // ---- sharing (owner only) -------------------------------------------------
  function renderGrants(grants) {
    var el = $('grantList');
    if (!grants.length) { el.innerHTML = '<span style="color:var(--ink-400);font-size:.82rem">No providers granted access yet.</span>'; return; }
    el.innerHTML = grants.map(function (g) {
      var who = g.granteeName || g.granteeUsername || g.granteeId;
      return '<div class="share-row"><span class="who">' + esc(who) + '</span>' +
        '<span class="lvl ' + (g.access === 'write' ? 'write' : '') + '">' + esc(g.access) + '</span>' +
        '<button class="rm" data-grant="' + esc(g.id) + '">Revoke</button></div>';
    }).join('');
    Array.prototype.forEach.call(el.querySelectorAll('.rm'), function (b) {
      b.addEventListener('click', function () {
        b.disabled = true;
        Hx.revokeGrant(id, b.getAttribute('data-grant')).then(loadSharing);
      });
    });
  }
  function renderShareLinks(tokens) {
    var active = (tokens || []).filter(function (t) { return !t.revokedAt; });
    $('shareCount').textContent = active.length;
    var el = $('shareLinkList');
    if (!active.length) { el.innerHTML = '<span style="color:var(--ink-400);font-size:.82rem">No share links.</span>'; return; }
    var base = location.origin + '/api/shared/';
    el.innerHTML = active.map(function (t) {
      var url = base + t.token;
      return '<div class="share-row"><span class="lnk" title="' + esc(url) + '">' + esc(t.label || t.access + ' link') + '</span>' +
        '<button class="rm copy-btn" data-copy="' + esc(url) + '" style="color:var(--blue-600)">Copy</button>' +
        '<button class="rm" data-token="' + esc(t.token) + '">Revoke</button></div>';
    }).join('');
    Array.prototype.forEach.call(el.querySelectorAll('[data-copy]'), function (b) {
      b.addEventListener('click', function () {
        var v = b.getAttribute('data-copy');
        try { navigator.clipboard.writeText(v); b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy'; }, 1200); } catch (e) {}
      });
    });
    Array.prototype.forEach.call(el.querySelectorAll('[data-token]'), function (b) {
      b.addEventListener('click', function () {
        b.disabled = true;
        Hx.revokeShare(id, b.getAttribute('data-token')).then(loadSharing);
      });
    });
  }
  function loadSharing() {
    return Promise.all([
      Hx.shareList(id).catch(function () { return { tokens: [] }; }),
      fetch('/api/repos/' + id + '/grant').then(function (r) { return r.ok ? r.json() : { grants: [] }; }).catch(function () { return { grants: [] }; }),
    ]).then(function (res) {
      renderShareLinks((res[0] && res[0].tokens) || []);
      renderGrants((res[1] && res[1].grants) || []);
    });
  }
  function setupSharing() {
    $('sharingBlock').style.display = '';
    $('grantForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = $('grantMsg'); msg.className = 'hx-form-msg';
      var u = $('grantUser').value.trim();
      if (!u) { msg.className = 'hx-form-msg err'; msg.textContent = 'Enter a username or email.'; return; }
      Hx.grant(id, u, $('grantAccess').value).then(function () {
        $('grantUser').value = ''; msg.className = 'hx-form-msg ok'; msg.textContent = 'Granted.';
        return loadSharing();
      }).catch(function (err) { msg.className = 'hx-form-msg err'; msg.textContent = (err && err.message) || 'Could not grant.'; });
    });
    $('createShareBtn').addEventListener('click', function () {
      var msg = $('shareLinkMsg'); msg.className = 'hx-form-msg';
      Hx.createShare(id, $('shareLinkAccess').value, 'Shared ' + new Date().toLocaleDateString()).then(function () {
        msg.className = 'hx-form-msg ok'; msg.textContent = 'Link created.';
        return loadSharing();
      }).catch(function (err) { msg.className = 'hx-form-msg err'; msg.textContent = (err && err.message) || 'Could not create link.'; });
    });
    loadSharing();
  }

  // ---- derive care team + conditions + meds from live data ------------------
  function deriveCareTeam() {
    var log = (repoData && repoData.log) || [];
    var seen = {}, team = [];
    log.forEach(function (c) {
      var name = c.authorName;
      if (name && !seen[name]) { seen[name] = true; team.push({ name: name }); }
    });
    return team;
  }

  // ---- master load ----------------------------------------------------------
  function loadAll() {
    return Promise.all([
      Hx.repo(id),
      Hx.files(id),
      Hx.alerts(),
      Hx.visits(id),
    ]).then(function (res) {
      repoData = res[0]; filesData = res[1]; alertsData = res[2] || [];
      var meds = bullets(filesData.files && filesData.files.medications).map(parseMed);
      var conditions = bullets(filesData.files && filesData.files.problems);
      var careTeam = deriveCareTeam();
      var flagged = {};
      alertsData.forEach(function (a) { (a.involved || []).forEach(function (i) { flagged[(i.name || '').split(' ')[0].toLowerCase()] = true; }); });

      renderHeader();
      renderFileList();
      renderFilesTab();
      renderTimeline();
      renderReadme(meds, conditions, careTeam, alertsData);
      renderSidebar(meds, conditions, careTeam, flagged);
      renderSafety(alertsData);

      $('commitCount').textContent = (repoData.log || []).length;
      $('tabTimelineNum').textContent = (repoData.log || []).length;
      $('aboutOwner').textContent = (repoData.repo && ownerHandle()) + ' · ' + ((repoData.repo && repoData.repo.name) || '');
      $('aboutVisits').textContent = (repoData.log || []).length + ' visit' + ((repoData.log || []).length === 1 ? '' : 's');
      $('exportAllBtn').setAttribute('href', Hx.exportUrl(id));

      // Codes tab is best-effort: the endpoint may not exist in every build.
      Hx.coded(id).then(renderCodes).catch(function () {
        $('codesBody').innerHTML = '<div class="hx-empty">Coding for this thread isn’t available yet.</div>';
      });
    });
  }

  // ---- boot -----------------------------------------------------------------
  (async function boot() {
    user = await Hx.requireSession();
    id = Hx.param('repo');
    if (!id) {
      var repos = await Hx.repos();
      id = repos[0] && repos[0].id;
    }
    if (!id) {
      document.querySelector('main').innerHTML = '<div class="hx-empty" style="padding:60px">You have no health threads yet.</div>';
      return;
    }

    // Wrap Hx.addVisit so EVERY commit (the Add-visit form AND the voice agent's
    // record_assessment / log_checkin / commit_visit tools) remembers its notes
    // and refreshes the page — making voice-logged symptoms appear in the
    // Timeline. (We wrap from the page; hx-api.js itself is never edited.)
    var origAddVisit = Hx.addVisit.bind(Hx);
    Hx.addVisit = function (rid, body) {
      if (rid === id) rememberVisit(body);
      return origAddVisit(rid, body).then(function (out) {
        if (rid === id) { loadAll().catch(function () {}); }
        return out;
      });
    };

    // Wire Call Hx (role from the session user).
    $('callHxBtn').addEventListener('click', function (e) {
      e.preventDefault();
      Hx.startVoice(user.role === 'provider' ? 'provider' : 'patient', id);
    });

    setupTabs();
    setupAddVisit();

    try {
      await loadAll();
    } catch (err) {
      if (err && err.status === 401) return; // requireSession handles redirect elsewhere
      document.querySelector('main').innerHTML = '<div class="hx-empty" style="padding:60px">Could not load this thread.<br><span style="color:var(--ink-400)">' + esc((err && err.message) || '') + '</span></div>';
      return;
    }

    // Sharing panel + Share button: owner only.
    if (isOwner()) {
      setupSharing();
      $('shareBtn').addEventListener('click', function (e) {
        e.preventDefault();
        var b = $('sharingBlock');
        b.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    } else {
      $('shareBtn').style.display = 'none';
    }
  })();
})();
