/* Safety check — fully dynamic. Pulls cross-repo alerts from the Hub and renders
 * the hero, involved medicines, the blame trail, the what-to-do checklist, and
 * the "what to say to your doctor" script. NOTHING hardcoded.
 *
 * Alerts are patient-wide (cross-repo): one med from Dr. Okafor + one from the ER
 * is exactly the kind of interaction no single record could catch. We still read
 * ?repo= so the back-link returns you to the thread you came from. */
(function () {
  const $ = (s) => document.querySelector(s);
  const esc = Hx.esc;
  const fmt = Hx.fmtDate;

  const repoId = Hx.param('repo');

  // Severity -> display label + pill class.
  const SEV = {
    high: { label: 'High priority', pill: 'sev-high', ink: 'var(--danger-600)' },
    medium: { label: 'Worth a look', pill: 'sev-medium', ink: '#9a6a00' },
    low: { label: 'Low priority', pill: 'sev-low', ink: 'var(--blue-600)' },
  };
  const sevOf = (s) => SEV[s] || SEV.low;

  // SVG snippets reused across cards.
  const ICON_WARN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>`;
  const ICON_BLAME = `<svg viewBox="0 0 24 24" fill="none" stroke="var(--blue-600)" stroke-width="2" style="width:20px;height:20px"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>`;
  const ICON_DO = `<svg viewBox="0 0 24 24" fill="none" stroke="var(--green-600)" stroke-width="2.2" style="width:20px;height:20px"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/></svg>`;
  const ICON_CHECK = `<svg viewBox="0 0 24 24" fill="none" stroke="var(--green-600)" stroke-width="2.4"><path d="M20 6 9 17l-5-5"/></svg>`;
  const ICON_ALARM = `<svg viewBox="0 0 24 24" fill="none" stroke="var(--danger-600)" stroke-width="2.2"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>`;

  // A "what to do" step that names an urgent symptom set gets the danger icon.
  const isUrgent = (step) => /urgent|emergency|call\s*9-?1-?1|right away/i.test(step);

  // Pick the icon color for a med dot, alternating so two meds read distinctly.
  function medRow(m, i) {
    const tones = [
      'background:var(--blue-50);color:var(--blue-600)',
      'background:var(--green-50);color:var(--green-700)',
      'background:#fff6e6;color:#9a6a00',
    ];
    const prov = [m.provider, m.date ? fmt(m.date) : null].filter(Boolean).map(esc).join(' · ');
    return `<div class="med-row">
      <span class="pill-dot" style="${tones[i % tones.length]}">💊</span>
      <div><b>${esc(m.name)}</b>${prov ? `<div class="prov">Added by ${prov}</div>` : ''}</div>
    </div>`;
  }

  // Blame trail: one node per involved med (who/when), then the auto-flag node.
  function blameTrail(a) {
    const meds = (a.involved || []).slice();
    // chronological — oldest first reads like history
    meds.sort((x, y) => String(x.date || '').localeCompare(String(y.date || '')));
    const tones = ['green', '', 'danger'];
    const rows = meds.map((m, i) => `
      <div class="blame-row">
        <div class="when">${m.date ? esc(fmt(m.date)) : 'date n/a'}</div>
        <div class="blame-node ${tones[i % 2 === 0 ? 0 : 1]}"><span class="nd"></span>
          <b>${esc(m.provider || 'A provider')} added ${esc(m.name)}</b>
          <span>${esc(m.provider || '')}${m.provider ? ' · ' : ''}this record never saw the other</span>
        </div>
      </div>`).join('');
    const flag = `
      <div class="blame-row">
        <div class="when">auto</div>
        <div class="blame-node danger"><span class="nd"></span>
          <b>Hx flagged ${esc(a.summary || 'a possible interaction')}</b>
          <span>written to conflicts.md and committed — the analysis is versioned too</span>
        </div>
      </div>`;
    return `<div class="blamewrap" style="margin-top:14px">${rows}${flag}</div>`;
  }

  function whatToDo(a) {
    const steps = (a.whatToDo || []).map((s) => `
      <li>${isUrgent(s) ? ICON_ALARM : ICON_CHECK}<span>${esc(s)}</span></li>`).join('');
    const say = a.script
      ? `<div class="say"><span class="k">What you can say to your doctor</span>“${esc(a.script)}”</div>`
      : '';
    return `<div class="prose-card">
      <h3>${ICON_DO} What to do</h3>
      <ul class="checklist">${steps || `<li>${ICON_CHECK}<span>Talk to your doctor about this combination.</span></li>`}</ul>
      ${say}
    </div>`;
  }

  function alertBlock(a, idx) {
    const sev = sevOf(a.severity);
    const sep = idx > 0 ? `<div class="alert-block-sep"></div>` : '';
    return `<div class="alert-block">${sep}
      <!-- HERO -->
      <div class="alert-card">
        <div class="alert-top">
          <span class="badge">${ICON_WARN}</span>
          <div>
            <h3>${esc(a.summary || a.title || 'Possible interaction')}</h3>
            <p><span class="sev-pill ${sev.pill}">${sev.label}</span></p>
          </div>
        </div>
        <div class="alert-body">
          <p style="font-size:1.02rem;color:var(--ink-700)">${esc(a.explanation || '')}</p>
          ${(a.involved || []).length ? `<div class="med-rows" style="margin-top:16px">${a.involved.map(medRow).join('')}</div>` : ''}
        </div>
      </div>

      <!-- BLAME TRAIL -->
      <div class="prose-card" style="margin-top:18px">
        <h3>${ICON_BLAME} How this happened — the blame trail</h3>
        <p class="muted" style="margin-top:6px;font-size:.92rem">Two providers, two systems, neither aware of the other. Because every entry is attributed, Hx can show exactly who added what, and when.</p>
        ${blameTrail(a)}
      </div>

      <!-- WHAT TO DO -->
      <div style="margin-top:18px">${whatToDo(a)}</div>
    </div>`;
  }

  function setHead(alerts) {
    const head = $('#sft-eyebrow');
    const title = $('#sft-title');
    if (!alerts.length) {
      head.textContent = 'Safety check';
      head.style.color = 'var(--green-700)';
      title.textContent = "You're all clear";
      return;
    }
    const top = alerts[0];
    const sev = sevOf(top.severity);
    const n = alerts.length;
    head.textContent = `Safety check · ${sev.label.toLowerCase()}`;
    head.style.color = sev.ink;
    title.textContent = n > 1
      ? `${n} medicine interactions need your attention`
      : (top.title || 'Two of your medicines may not be safe together');
    // notification dot in the app bar reflects the live count
    const ndot = $('#ndot');
    if (ndot) { ndot.textContent = String(n); ndot.style.display = ''; }
  }

  function wireCall() {
    const start = (e) => { if (e) e.preventDefault(); Hx.startVoice('patient', repoId || undefined); };
    ['#sft-call', '#sft-call-empty'].forEach((sel) => {
      const el = $(sel);
      if (el) el.addEventListener('click', start);
    });
  }

  async function main() {
    // 401 -> requireSession redirects to login.html.
    const me = await Hx.requireSession();

    // Personalize the back-link + avatar where we can (no hardcoded names).
    const back = $('#sft-backlink');
    if (back && repoId) back.setAttribute('href', `app.html?repo=${encodeURIComponent(repoId)}`);
    const av = $('#sft-avatar');
    if (av && me && me.displayName) av.alt = me.displayName;

    let alerts = [];
    try {
      alerts = await Hx.alerts();
    } catch {
      alerts = [];
    }

    $('#sft-loading').style.display = 'none';
    setHead(alerts);

    if (!alerts.length) {
      $('#sft-empty').style.display = '';
    } else {
      $('#sft-alerts').innerHTML = alerts.map(alertBlock).join('');
    }

    // Voice CTA is always offered once we know the state.
    $('#sft-cta').style.display = '';
    wireCall();
  }

  main();
})();
