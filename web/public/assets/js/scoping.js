/* Data-scoping control center (patient). For every thread (repo) the patient
 * owns, show who currently has access — provider grants + active share links —
 * and give plain controls to grant a provider, create a share link, and revoke
 * either. NOTHING hardcoded: everything is read from the Hub via window.Hx.
 *
 * The shared client exposes shareList/createShare/revokeShare and grant/
 * revokeGrant. Listing existing grants isn't a client method, so we read the
 * same-origin GET /api/repos/:id/grant directly (cookies carry the session). */
(function () {
  const esc = Hx.esc;
  const fmt = Hx.fmtDate;

  // Same-origin JSON GET (used only for the grants list, which Hx has no getter for).
  async function grantList(id) {
    try {
      const r = await fetch(`/api/repos/${id}/grant`, { headers: { 'Content-Type': 'application/json' } });
      if (!r.ok) return [];
      const d = await r.json();
      return (d.grants || []).filter((g) => !g.revokedAt);
    } catch {
      return [];
    }
  }

  const accTag = (access) =>
    access === 'write'
      ? '<span class="acc-tag acc-write">Write</span>'
      : '<span class="acc-tag acc-read">Read</span>';

  const ICON_USER = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
  const ICON_LINK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5"/></svg>`;
  const ICON_THREAD = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M3 12h6M15 12h6"/></svg>`;

  // Initials avatar for a provider with no photo.
  function initialsAv(name) {
    const ini = String(name || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
    return `<span class="av-mono" style="width:34px;height:34px;font-size:.82rem;background:linear-gradient(135deg,var(--green-500),var(--green-700))">${esc(ini)}</span>`;
  }

  // ---- per-card renderers -------------------------------------------------

  function renderGrants(grants) {
    if (!grants.length) {
      return `<div class="sc-empty">No doctors have access to this thread yet.</div>`;
    }
    return grants
      .map((g) => {
        const name = g.granteeName || g.granteeUsername || 'Provider';
        const subBits = [g.granteeRole, g.granteeOrg].filter(Boolean).map(esc);
        if (g.granteeUsername && g.granteeUsername !== name) subBits.unshift(esc(g.granteeUsername));
        const sub = subBits.join(' · ') || 'Provider';
        return `<div class="access-row" data-grant="${esc(g.id)}">
          ${initialsAv(name)}
          <div class="ar-meta"><b>${esc(name)}</b><span>${sub}</span></div>
          ${accTag(g.access)}
          <button class="lnk-revoke" data-revoke-grant="${esc(g.id)}">Revoke</button>
        </div>`;
      })
      .join('');
  }

  function renderTokens(tokens) {
    if (!tokens.length) {
      return `<div class="sc-empty">No active share links. Create one below to share read-only access.</div>`;
    }
    return tokens
      .map((t) => {
        const url = `${location.origin}/api/shared/${t.token}`;
        const created = t.createdAt ? `Created ${esc(fmt(t.createdAt))}` : 'Active link';
        const expires = t.expiresAt ? ` · expires ${esc(fmt(t.expiresAt))}` : '';
        return `<div class="access-row" data-token="${esc(t.token)}">
          <span class="av-mono" style="width:34px;height:34px;background:linear-gradient(135deg,var(--blue-400),var(--blue-600))">${ICON_LINK}</span>
          <div class="ar-meta">
            <b>${esc(t.label || 'Share link')}</b>
            <span>${created}${expires}</span>
          </div>
          ${accTag(t.access)}
          <button class="lnk-copy" data-copy="${esc(url)}">Copy link</button>
          <button class="lnk-revoke" data-revoke-token="${esc(t.token)}">Revoke</button>
        </div>`;
      })
      .join('');
  }

  function cardShell(repo) {
    const owner = repo.name || 'Health thread';
    return `<div class="scope-card" data-repo="${esc(repo.id)}">
      <div class="sc-head">
        <span class="sc-ico">${ICON_THREAD}</span>
        <div>
          <div class="sc-name">${esc(owner)}</div>
          <div class="sc-path">${esc(repo.description || 'private thread')}</div>
        </div>
        <span class="vis-pill sc-vis">Private · yours</span>
      </div>
      <div class="sc-body">
        <div class="sc-sub">${ICON_USER} Doctors with access <span class="cnt" data-grant-count>0</span></div>
        <div data-grants><div class="sc-empty">Loading…</div></div>
        <form class="grant-form" data-grant-form>
          <input class="scope-input" type="text" placeholder="Doctor's email or username" data-grant-input autocomplete="off" />
          <select class="scope-sel" data-grant-access>
            <option value="read">Read — can view</option>
            <option value="write">Write — view &amp; add visits</option>
          </select>
          <button type="submit" class="btn btn-primary btn-sm">Grant access</button>
        </form>
        <div class="form-err" data-grant-err></div>

        <div class="sc-sub">${ICON_LINK} Share links <span class="cnt" data-token-count>0</span></div>
        <div data-tokens><div class="sc-empty">Loading…</div></div>
        <form class="form-row" data-share-form>
          <input class="scope-input" type="text" placeholder="Label (e.g. “Pharmacy”, optional)" data-share-label autocomplete="off" />
          <select class="scope-sel" data-share-access>
            <option value="read">Read-only link</option>
            <option value="write">Write link</option>
          </select>
          <button type="submit" class="btn btn-accent btn-sm">Create link</button>
        </form>
        <div class="form-note">Anyone with a link can open this thread until you revoke it.</div>
        <div class="form-err" data-share-err></div>
      </div>
    </div>`;
  }

  // Refresh just one card's access lists (after a mutation).
  async function refreshCard(card, repoId) {
    const [grants, share] = await Promise.all([grantList(repoId), Hx.shareList(repoId)]);
    const tokens = ((share && share.tokens) || []).filter((t) => !t.revokedAt);
    card.querySelector('[data-grants]').innerHTML = renderGrants(grants);
    card.querySelector('[data-tokens]').innerHTML = renderTokens(tokens);
    card.querySelector('[data-grant-count]').textContent = String(grants.length);
    card.querySelector('[data-token-count]').textContent = String(tokens.length);
  }

  // ---- wiring -------------------------------------------------------------

  function wireCard(card, repoId) {
    // Grant a provider.
    const gForm = card.querySelector('[data-grant-form]');
    const gErr = card.querySelector('[data-grant-err]');
    gForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      gErr.textContent = '';
      const input = card.querySelector('[data-grant-input]');
      const username = input.value.trim();
      const access = card.querySelector('[data-grant-access]').value;
      if (!username) { gErr.textContent = 'Enter a doctor’s email or username.'; return; }
      const btn = gForm.querySelector('button');
      btn.disabled = true;
      try {
        await Hx.grant(repoId, username, access);
        input.value = '';
        await refreshCard(card, repoId);
      } catch (err) {
        gErr.textContent = (err && err.message) || 'Could not grant access.';
      } finally {
        btn.disabled = false;
      }
    });

    // Create a share link.
    const sForm = card.querySelector('[data-share-form]');
    const sErr = card.querySelector('[data-share-err]');
    sForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      sErr.textContent = '';
      const label = card.querySelector('[data-share-label]').value.trim();
      const access = card.querySelector('[data-share-access]').value;
      const btn = sForm.querySelector('button');
      btn.disabled = true;
      try {
        await Hx.createShare(repoId, access, label || undefined);
        card.querySelector('[data-share-label]').value = '';
        await refreshCard(card, repoId);
      } catch (err) {
        sErr.textContent = (err && err.message) || 'Could not create link.';
      } finally {
        btn.disabled = false;
      }
    });

    // Delegated clicks: revoke grant / revoke token / copy link.
    card.addEventListener('click', async (e) => {
      const copyBtn = e.target.closest('[data-copy]');
      if (copyBtn) {
        e.preventDefault();
        const url = copyBtn.getAttribute('data-copy');
        try { await navigator.clipboard.writeText(url); } catch {}
        const prev = copyBtn.textContent;
        copyBtn.textContent = 'Copied';
        setTimeout(() => { copyBtn.textContent = prev; }, 1400);
        return;
      }
      const rg = e.target.closest('[data-revoke-grant]');
      if (rg) {
        e.preventDefault();
        rg.disabled = true;
        try {
          const res = await Hx.revokeGrant(repoId, rg.getAttribute('data-revoke-grant'));
          if (!res.ok) throw new Error('revoke failed');
          await refreshCard(card, repoId);
        } catch {
          rg.disabled = false;
        }
        return;
      }
      const rt = e.target.closest('[data-revoke-token]');
      if (rt) {
        e.preventDefault();
        rt.disabled = true;
        try {
          const res = await Hx.revokeShare(repoId, rt.getAttribute('data-revoke-token'));
          if (!res.ok) throw new Error('revoke failed');
          await refreshCard(card, repoId);
        } catch {
          rt.disabled = false;
        }
      }
    });
  }

  async function main() {
    // 401 -> requireSession redirects to login.html.
    const me = await Hx.requireSession();
    const av = document.getElementById('scope-avatar');
    if (av && me && me.displayName) av.alt = me.displayName;

    let repos = [];
    try {
      repos = await Hx.repos();
    } catch {
      repos = [];
    }
    // Patients own their repos (write access). Only show owned threads — the
    // scoping controls are owner-only on the server anyway.
    const owned = repos.filter((r) => !me || r.access === 'write' || r.ownerId === me.id);
    const list = owned.length ? owned : repos;

    document.getElementById('scope-loading').style.display = 'none';

    if (!list.length) {
      document.getElementById('scope-empty').style.display = '';
      return;
    }

    const grid = document.getElementById('scope-grid');
    grid.innerHTML = list.map(cardShell).join('');

    // Hydrate each card's access lists + wire its controls.
    for (const repo of list) {
      const card = grid.querySelector(`.scope-card[data-repo="${CSS.escape(repo.id)}"]`);
      if (!card) continue;
      wireCard(card, repo.id);
      refreshCard(card, repo.id);
    }
  }

  main();
})();
