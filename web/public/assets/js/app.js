/* Hx — front-end interactions + live wiring to the Hx Hub APIs (same-origin). */
(function () {
  // ---------- Landing visuals (unchanged) ----------
  const nav = document.getElementById('nav');
  if (nav) {
    const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }
  const grid = document.getElementById('heatmap');
  if (grid) {
    const WEEKS = 53, DAYS = 7;
    let s = 1337;
    const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const spikes = { 30: 3, 31: 2, 38: 2, 48: 3, 51: 4, 52: 3 };
    for (let w = 0; w < WEEKS; w++) {
      for (let d = 0; d < DAYS; d++) {
        const cell = document.createElement('span');
        cell.className = 'sq';
        let lvl = 0;
        const r = rnd();
        if (r > 0.86) lvl = 1;
        if (r > 0.95) lvl = 2;
        if (spikes[w] && rnd() > 0.45) lvl = Math.min(4, spikes[w] + (rnd() > 0.6 ? 1 : 0));
        if (lvl) cell.classList.add('l' + lvl);
        const label = ['logged a check-in', 'medication reminder', 'a visit was recorded', 'a safety check ran'][Math.min(lvl - 1, 3)];
        if (lvl) cell.title = label;
        grid.appendChild(cell);
      }
    }
  }
  const months = document.getElementById('cal-months');
  if (months) {
    const order = ['Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May'];
    months.innerHTML = order.map((m) => `<span style="flex:1">${m}</span>`).join('');
  }

  // ---------- Hub API wiring ----------
  const isApp = !!document.querySelector('.repo-shell') || !!document.querySelector('.alert-card');
  const api = (p, init) => fetch(p, { ...init, headers: { 'Content-Type': 'application/json', ...(init && init.headers) } });

  // Ensure a session for the demo (auto demo-login as Maria, the patient).
  async function ensureSession() {
    try {
      const me = await api('/api/auth/me');
      if (me.ok) return (await me.json()).user;
    } catch {}
    try {
      const r = await api('/api/auth/dev-login', { method: 'POST', body: JSON.stringify({ userId: 'maria' }) });
      if (r.ok) return (await r.json()).user;
    } catch {}
    return null;
  }

  // Pull the cross-repo safety alerts and reflect them in the UI.
  async function loadAlerts() {
    try {
      const r = await api('/api/hub/alerts');
      if (!r.ok) return;
      const { alerts } = await r.json();
      const top = (alerts || [])[0];
      // Safety banner on the app page
      const banner = document.querySelector('.repo-banner');
      if (banner && top) {
        const b = banner.querySelector('b');
        const p = banner.querySelector('p');
        if (b) b.textContent = top.title;
        if (p) p.textContent = (top.involved || []).map((i) => i.name).join(' + ') + ' — ' + (top.summary || '').toLowerCase();
      }
      if (banner && !top) banner.style.display = 'none';
      // Safety-alert count stat
      const safeStat = document.querySelector('.stat .n[style*="danger"]');
      if (safeStat) safeStat.textContent = String((alerts || []).length);
      // Notification dot
      const ndot = document.querySelector('.ndot');
      if (ndot) { const n = (alerts || []).length; if (n) ndot.textContent = String(n); else ndot.style.display = 'none'; }
    } catch {}
  }

  // ---------- Inline voice agent (ported, vanilla) ----------
  const RATE = 24000;
  let voiceState = null;

  function f32ToB64(f32) {
    const buf = new ArrayBuffer(f32.length * 2), view = new DataView(buf);
    for (let i = 0; i < f32.length; i++) { const s = Math.max(-1, Math.min(1, f32[i])); view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
    const bytes = new Uint8Array(buf); let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function playB64(b64, ac, head) {
    const bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const view = new DataView(bytes.buffer), n = Math.floor(bytes.length / 2), f32 = new Float32Array(n);
    for (let i = 0; i < n; i++) f32[i] = view.getInt16(i * 2, true) / 0x8000;
    const buffer = ac.createBuffer(1, n, RATE); buffer.getChannelData(0).set(f32);
    const node = ac.createBufferSource(); node.buffer = buffer; node.connect(ac.destination);
    const startAt = Math.max(ac.currentTime, head.t); node.start(startAt); head.t = startAt + buffer.duration;
  }

  function buildOverlay() {
    const el = document.createElement('div');
    el.id = 'hx-voice';
    el.innerHTML = `
      <div class="hxv-card">
        <button class="hxv-close" aria-label="Close">&times;</button>
        <div class="hxv-mic" id="hxv-mic">🎙️</div>
        <div class="hxv-status" id="hxv-status">Connecting…</div>
        <div class="hxv-cap" id="hxv-cap"></div>
        <ul class="hxv-log" id="hxv-log"></ul>
        <div class="hxv-foot">Grok Voice · say “can we do my check-in?” or “are my meds safe together?”</div>
      </div>`;
    const css = document.createElement('style');
    css.textContent = `
      #hx-voice{position:fixed;inset:0;background:rgba(10,15,25,.55);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:9999}
      #hx-voice .hxv-card{background:#fff;border-radius:22px;padding:30px 28px;max-width:380px;width:92%;text-align:center;box-shadow:0 30px 80px rgba(0,0,0,.35);position:relative;font-family:inherit}
      #hx-voice .hxv-close{position:absolute;top:12px;right:14px;border:0;background:none;font-size:26px;color:#94a3b8;cursor:pointer;line-height:1}
      #hx-voice .hxv-mic{width:92px;height:92px;border-radius:50%;background:linear-gradient(135deg,#13b5a6,#0c8f86);color:#fff;display:flex;align-items:center;justify-content:center;font-size:38px;margin:6px auto 14px;transition:transform .2s}
      #hx-voice .hxv-mic.live{background:linear-gradient(135deg,#ef4444,#dc2626);animation:hxpulse 1.4s infinite}
      @keyframes hxpulse{0%{box-shadow:0 0 0 0 rgba(239,68,68,.45)}70%{box-shadow:0 0 0 18px rgba(239,68,68,0)}100%{box-shadow:0 0 0 0 rgba(239,68,68,0)}}
      #hx-voice .hxv-status{font-weight:700;color:#0f172a;margin-bottom:8px}
      #hx-voice .hxv-cap{font-size:.92rem;color:#334155;background:#f1f5f9;border-radius:12px;padding:10px;min-height:20px;max-height:120px;overflow:auto;text-align:left}
      #hx-voice .hxv-cap:empty{display:none}
      #hx-voice .hxv-log{list-style:none;margin:12px 0 0;padding:0;text-align:left;font-size:.88rem}
      #hx-voice .hxv-log li{padding:2px 0}
      #hx-voice .hxv-log li.warn{color:#dc2626}#hx-voice .hxv-log li.ok{color:#0c8f86}
      #hx-voice .hxv-foot{margin-top:14px;font-size:.76rem;color:#94a3b8}`;
    document.head.appendChild(css);
    document.body.appendChild(el);
    el.querySelector('.hxv-close').onclick = stopVoice;
    el.addEventListener('click', (e) => { if (e.target === el) stopVoice(); });
    return el;
  }

  function vlog(kind, text) {
    const ul = document.getElementById('hxv-log'); if (!ul) return;
    const li = document.createElement('li'); li.className = kind; li.textContent = text; ul.appendChild(li);
  }

  async function runTool(name, args) {
    try {
      if (name === 'record_assessment')
        return await (await api(`/api/repos/${voiceState.repoId}/visits`, { method: 'POST', body: JSON.stringify({ title: `${args.instrument} check-in`, summary: `${args.instrument} score ${args.score}`, notes: [`${args.instrument}: ${args.score}`] }) })).text().then((t) => { vlog('ok', `📋 ${args.instrument} recorded: ${args.score}`); return t; });
      if (name === 'log_checkin')
        return await (await api(`/api/repos/${voiceState.repoId}/visits`, { method: 'POST', body: JSON.stringify({ title: 'Check-in', summary: args.summary || '', notes: [...((args.symptoms) || []), ...(((args.negatives) || []).map((n) => `reports NOT: ${n}`))] }) })).text().then((t) => { vlog('ok', `📝 Check-in saved`); loadAlerts(); return t; });
      if (name === 'check_meds')
        return await (await api('/api/hub/alerts')).text().then((t) => { try { const a = JSON.parse(t).alerts || []; if (a.length) vlog('warn', `⚠️ ${a.length} interaction alert`); } catch {} return t; });
    } catch (e) { return JSON.stringify({ ok: false, error: String(e) }); }
    return JSON.stringify({ error: 'unknown tool' });
  }

  async function startVoice() {
    const overlay = buildOverlay();
    const setStatus = (t) => { const s = document.getElementById('hxv-status'); if (s) s.textContent = t; };
    const calls = new Map();
    try {
      const data = await (await api('/api/voice/agent-token?role=patient')).json();
      if (!data.token) throw new Error(data.error || 'no token');
      voiceState = { repoId: data.repoId };
      const ac = new AudioContext({ sampleRate: RATE });
      const head = { t: ac.currentTime };
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ws = new WebSocket(`wss://api.x.ai/v1/realtime?model=${data.model}`, [`xai-client-secret.${data.token}`]);
      voiceState.ws = ws; voiceState.ac = ac; voiceState.stream = stream;
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'session.update', session: { instructions: data.instructions, voice: data.voice || 'eve', turn_detection: { type: 'server_vad' }, reasoning_effort: 'none', tools: data.tools, audio: { input: { format: { type: 'audio/pcm', rate: RATE } }, output: { format: { type: 'audio/pcm', rate: RATE } } } } }));
        ws.send(JSON.stringify({ type: 'response.create' }));
        const src = ac.createMediaStreamSource(stream);
        const proc = ac.createScriptProcessor(4096, 1, 1);
        voiceState.proc = proc; voiceState.src = src;
        proc.onaudioprocess = (e) => { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: f32ToB64(e.inputBuffer.getChannelData(0)) })); };
        src.connect(proc); proc.connect(ac.destination);
        setStatus('Listening…'); document.getElementById('hxv-mic').classList.add('live');
      };
      ws.onmessage = (evt) => {
        let ev; try { ev = JSON.parse(typeof evt.data === 'string' ? evt.data : ''); } catch { return; }
        if (ev.type === 'response.output_audio.delta' && ev.delta) playB64(ev.delta, ac, head);
        else if (ev.type === 'response.output_audio_transcript.delta' && typeof ev.delta === 'string') { const c = document.getElementById('hxv-cap'); if (c) c.textContent = (c.textContent + ev.delta).slice(-400); }
        else if (ev.type === 'response.created') { const c = document.getElementById('hxv-cap'); if (c) c.textContent = ''; }
        else if (ev.type === 'response.output_item.added' && ev.item?.type === 'function_call') calls.set(ev.item.call_id, { name: ev.item.name, args: '' });
        else if (ev.type === 'response.function_call_arguments.delta') { const c = calls.get(ev.call_id); if (c) c.args += ev.delta || ''; }
        else if (ev.type === 'response.function_call_arguments.done') {
          const stored = calls.get(ev.call_id); const nm = ev.name || stored?.name; const argsStr = ev.arguments ?? stored?.args ?? '{}';
          calls.delete(ev.call_id);
          if (nm) runTool(nm, JSON.parse(argsStr || '{}')).then((out) => { ws.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: ev.call_id, output: typeof out === 'string' ? out : JSON.stringify(out) } })); ws.send(JSON.stringify({ type: 'response.create' })); });
        } else if (ev.type === 'error') setStatus(ev.error?.message || 'Voice error');
      };
      ws.onclose = () => setStatus('Call ended');
      ws.onerror = () => setStatus('Connection error');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Could not start');
    }
  }

  function stopVoice() {
    try { voiceState?.proc?.disconnect(); voiceState?.src?.disconnect(); voiceState?.stream?.getTracks().forEach((t) => t.stop()); voiceState?.ws?.close(); voiceState?.ac?.close(); } catch {}
    document.getElementById('hx-voice')?.remove();
    voiceState = null;
  }

  // Wire every "Call Hx" button (app bar, repo actions, safety CTA) to the voice agent.
  function wireCallButtons() {
    document.querySelectorAll('a, button').forEach((b) => {
      if (/call hx/i.test(b.textContent || '')) {
        b.classList.remove('soon');
        b.addEventListener('click', (e) => { e.preventDefault(); startVoice(); });
      }
    });
  }

  if (isApp) {
    ensureSession().then(() => { loadAlerts(); });
    wireCallButtons();
  }
})();
