/* Hx shared client — used by every static page. Talks to the same-origin Hub API
 * (cookies carry the session). NOTHING hardcoded: all data comes from these calls.
 * Exposes window.Hx. */
(function () {
  const J = (p, init) =>
    fetch(p, { ...init, headers: { 'Content-Type': 'application/json', ...(init && init.headers) } });
  async function json(p, init) {
    const r = await J(p, init);
    let body = null;
    try { body = await r.json(); } catch {}
    if (!r.ok) throw Object.assign(new Error((body && body.error) || r.statusText), { status: r.status, body });
    return body;
  }

  const Hx = {
    // ---- auth ----
    me: () => json('/api/auth/me').then((d) => d.user).catch(() => null),
    devLogin: (userId) => json('/api/auth/dev-login', { method: 'POST', body: JSON.stringify({ userId }) }).then((d) => d.user),
    logout: () => J('/api/auth/logout', { method: 'POST' }),
    // Redirect to login if not authed; returns the user otherwise.
    async requireSession() {
      const u = await Hx.me();
      if (!u) { location.href = 'login.html'; throw new Error('redirecting to login'); }
      return u;
    },

    // ---- data (all dynamic) ----
    repos: () => json('/api/repos').then((d) => d.repos || []),
    repo: (id) => json(`/api/repos/${id}`),
    files: (id) => json(`/api/repos/${id}/files`),
    coded: (id) => json(`/api/repos/${id}/coded`),
    visits: (id) => json(`/api/repos/${id}/visits`).then((d) => d.visits || []),
    addVisit: (id, body) => json(`/api/repos/${id}/visits`, { method: 'POST', body: JSON.stringify(body) }),
    editVisit: (id, body) => json(`/api/repos/${id}/visits`, { method: 'PATCH', body: JSON.stringify(body) }),
    alerts: () => json('/api/hub/alerts').then((d) => d.alerts || []).catch(() => []),

    // ---- sharing / scoping ----
    shareList: (id) => json(`/api/repos/${id}/share`).catch(() => ({ tokens: [] })),
    createShare: (id, access, label) => json(`/api/repos/${id}/share`, { method: 'POST', body: JSON.stringify({ access, label }) }),
    revokeShare: (id, token) => J(`/api/repos/${id}/share`, { method: 'DELETE', body: JSON.stringify({ token }) }),
    grant: (id, granteeUsername, access) => json(`/api/repos/${id}/grant`, { method: 'POST', body: JSON.stringify({ granteeUsername, access }) }),
    revokeGrant: (id, grantId) => J(`/api/repos/${id}/grant`, { method: 'DELETE', body: JSON.stringify({ grantId }) }),

    // export a file (download). file = "medications"|"problems"|"allergies"|undefined(all)
    exportUrl: (id, file) => `/api/repos/${id}/export${file ? `?file=${encodeURIComponent(file)}` : ''}`,

    // ---- tiny DOM helpers ----
    qs: (s, r) => (r || document).querySelector(s),
    param: (k) => new URLSearchParams(location.search).get(k),
    esc: (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
    fmtDate: (iso) => { try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return iso; } },

    // ---- inline voice agent (Grok realtime). role: 'patient'|'provider' ----
    startVoice(role, repoId) {
      if (document.getElementById('hx-voice')) return;
      const RATE = 24000;
      const overlay = document.createElement('div');
      overlay.id = 'hx-voice';
      overlay.innerHTML = `<div class="hxv-card"><button class="hxv-close" aria-label="Close">&times;</button>
        <div class="hxv-mic" id="hxv-mic">🎙️</div><div class="hxv-status" id="hxv-status">Connecting…</div>
        <div class="hxv-cap" id="hxv-cap"></div><ul class="hxv-log" id="hxv-log"></ul>
        <div class="hxv-foot">Grok Voice · ${role === 'provider' ? 'dictate the visit, prescribe, commit' : 'say “can we do my check-in?” or “are my meds safe?”'}</div></div>`;
      if (!document.getElementById('hxv-style')) {
        const css = document.createElement('style'); css.id = 'hxv-style';
        css.textContent = `#hx-voice{position:fixed;inset:0;background:rgba(10,15,25,.55);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:9999}#hx-voice .hxv-card{background:#fff;border-radius:22px;padding:30px 28px;max-width:380px;width:92%;text-align:center;box-shadow:0 30px 80px rgba(0,0,0,.35);position:relative;font-family:inherit}#hx-voice .hxv-close{position:absolute;top:12px;right:14px;border:0;background:none;font-size:26px;color:#94a3b8;cursor:pointer}#hx-voice .hxv-mic{width:92px;height:92px;border-radius:50%;background:linear-gradient(135deg,#13b5a6,#0c8f86);color:#fff;display:flex;align-items:center;justify-content:center;font-size:38px;margin:6px auto 14px}#hx-voice .hxv-mic.live{background:linear-gradient(135deg,#ef4444,#dc2626);animation:hxpulse 1.4s infinite}@keyframes hxpulse{0%{box-shadow:0 0 0 0 rgba(239,68,68,.45)}70%{box-shadow:0 0 0 18px rgba(239,68,68,0)}100%{box-shadow:0 0 0 0 rgba(239,68,68,0)}}#hx-voice .hxv-status{font-weight:700;color:#0f172a;margin-bottom:8px}#hx-voice .hxv-cap{font-size:.92rem;color:#334155;background:#f1f5f9;border-radius:12px;padding:10px;min-height:20px;max-height:120px;overflow:auto;text-align:left}#hx-voice .hxv-cap:empty{display:none}#hx-voice .hxv-log{list-style:none;margin:12px 0 0;padding:0;text-align:left;font-size:.88rem}#hx-voice .hxv-log li.warn{color:#dc2626}#hx-voice .hxv-log li.ok{color:#0c8f86}#hx-voice .hxv-foot{margin-top:14px;font-size:.76rem;color:#94a3b8}`;
        document.head.appendChild(css);
      }
      document.body.appendChild(overlay);
      const status = (t) => { const s = document.getElementById('hxv-status'); if (s) s.textContent = t; };
      const vlog = (k, t) => { const ul = document.getElementById('hxv-log'); if (ul) { const li = document.createElement('li'); li.className = k; li.textContent = t; ul.appendChild(li); } };
      const state = { repoId };
      const stop = () => { try { state.proc && state.proc.disconnect(); state.src && state.src.disconnect(); state.stream && state.stream.getTracks().forEach((t) => t.stop()); state.ws && state.ws.close(); state.ac && state.ac.close(); } catch {} overlay.remove(); };
      overlay.querySelector('.hxv-close').onclick = stop;
      overlay.addEventListener('click', (e) => { if (e.target === overlay) stop(); });
      const f32b64 = (f32) => { const b = new ArrayBuffer(f32.length * 2), v = new DataView(b); for (let i = 0; i < f32.length; i++) { const s = Math.max(-1, Math.min(1, f32[i])); v.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); } const by = new Uint8Array(b); let s = ''; for (let i = 0; i < by.length; i++) s += String.fromCharCode(by[i]); return btoa(s); };
      const head = { t: 0 };
      const play = (b64, ac) => { const bin = atob(b64), by = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) by[i] = bin.charCodeAt(i); const v = new DataView(by.buffer), n = Math.floor(by.length / 2), f = new Float32Array(n); for (let i = 0; i < n; i++) f[i] = v.getInt16(i * 2, true) / 0x8000; const buf = ac.createBuffer(1, n, RATE); buf.getChannelData(0).set(f); const node = ac.createBufferSource(); node.buffer = buf; node.connect(ac.destination); const at = Math.max(ac.currentTime, head.t); node.start(at); head.t = at + buf.duration; };
      const runTool = async (name, args) => {
        try {
          const rid = state.repoId;
          if (name === 'record_assessment') { await Hx.addVisit(rid, { title: `${args.instrument} check-in`, summary: `${args.instrument} score ${args.score}`, notes: [`${args.instrument}: ${args.score}`] }); vlog('ok', `📋 ${args.instrument}: ${args.score}`); return { ok: true }; }
          if (name === 'log_checkin') { await Hx.addVisit(rid, { title: 'Check-in', summary: args.summary || '', notes: [...((args.symptoms) || []), ...(((args.negatives) || []).map((n) => `reports NOT: ${n}`))] }); vlog('ok', '📝 Check-in saved'); return { ok: true }; }
          if (name === 'check_meds') { const a = await Hx.alerts(); if (a.length) vlog('warn', `⚠️ ${a.length} interaction alert`); return { alerts: a }; }
          if (name === 'get_summary') { return await Hx.repo(rid); }
          if (name === 'prescribe') { const r = await json(`/api/hub/check-interaction`, { method: 'POST', body: JSON.stringify({ repoId: rid, name: args.name, dose: args.dose, reason: args.reason }) }); if ((r.warnings || []).length) vlog('warn', `⚠️ ${args.name}: ${r.warnings[0].summary || 'interaction risk'}`); else vlog('ok', `✓ ${args.name} — no interaction`); return r; }
          if (name === 'commit_visit') { await Hx.addVisit(rid, { title: args.title, summary: args.summary, addProblems: ((args.diagnoses) || []).map((n) => ({ name: n })), addMedications: ((args.medications) || []).map((m) => ({ name: m.name, dose: m.dose || '', reason: m.reason || '' })), notes: args.notes || [] }); vlog('ok', `✅ Committed: ${args.title}`); return { ok: true }; }
        } catch (e) { return { ok: false, error: String(e) }; }
        return { error: 'unknown tool' };
      };
      (async () => {
        try {
          const data = await json(`/api/voice/agent-token?role=${role}${repoId ? `&repoId=${repoId}` : ''}`);
          if (!data.token) throw new Error(data.error || 'no token');
          state.repoId = data.repoId || repoId;
          const ac = new AudioContext({ sampleRate: RATE }); head.t = ac.currentTime; state.ac = ac;
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); state.stream = stream;
          const ws = new WebSocket(`wss://api.x.ai/v1/realtime?model=${data.model}`, [`xai-client-secret.${data.token}`]); state.ws = ws;
          const calls = new Map();
          ws.onopen = () => {
            ws.send(JSON.stringify({ type: 'session.update', session: { instructions: data.instructions, voice: data.voice || 'eve', turn_detection: { type: 'server_vad' }, reasoning_effort: 'none', tools: data.tools, audio: { input: { format: { type: 'audio/pcm', rate: RATE } }, output: { format: { type: 'audio/pcm', rate: RATE } } } } }));
            ws.send(JSON.stringify({ type: 'response.create' }));
            const src = ac.createMediaStreamSource(stream); const proc = ac.createScriptProcessor(4096, 1, 1); state.proc = proc; state.src = src;
            proc.onaudioprocess = (e) => { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: f32b64(e.inputBuffer.getChannelData(0)) })); };
            src.connect(proc); proc.connect(ac.destination); status('Listening…'); document.getElementById('hxv-mic').classList.add('live');
          };
          ws.onmessage = (evt) => {
            let ev; try { ev = JSON.parse(typeof evt.data === 'string' ? evt.data : ''); } catch { return; }
            if (ev.type === 'response.output_audio.delta' && ev.delta) play(ev.delta, ac);
            else if (ev.type === 'response.output_audio_transcript.delta' && typeof ev.delta === 'string') { const c = document.getElementById('hxv-cap'); if (c) c.textContent = (c.textContent + ev.delta).slice(-400); }
            else if (ev.type === 'response.created') { const c = document.getElementById('hxv-cap'); if (c) c.textContent = ''; }
            else if (ev.type === 'response.output_item.added' && ev.item && ev.item.type === 'function_call') calls.set(ev.item.call_id, { name: ev.item.name, args: '' });
            else if (ev.type === 'response.function_call_arguments.delta') { const c = calls.get(ev.call_id); if (c) c.args += ev.delta || ''; }
            else if (ev.type === 'response.function_call_arguments.done') { const st = calls.get(ev.call_id); const nm = ev.name || (st && st.name); const a = ev.arguments != null ? ev.arguments : (st && st.args) || '{}'; calls.delete(ev.call_id); if (nm) runTool(nm, JSON.parse(a || '{}')).then((out) => { ws.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: ev.call_id, output: JSON.stringify(out) } })); ws.send(JSON.stringify({ type: 'response.create' })); }); }
            else if (ev.type === 'error') status((ev.error && ev.error.message) || 'Voice error');
          };
          ws.onclose = () => status('Call ended'); ws.onerror = () => status('Connection error');
        } catch (e) { status(e instanceof Error ? e.message : 'Could not start'); }
      })();
    },
  };
  window.Hx = Hx;
})();
