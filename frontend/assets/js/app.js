/* Hx — light front-end interactions (no framework) */
(function () {
  // Sticky nav shadow on scroll
  const nav = document.getElementById('nav');
  if (nav) {
    const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // Build the "health activity" contribution heatmap (GitHub-style)
  const grid = document.getElementById('heatmap');
  if (grid) {
    const WEEKS = 53, DAYS = 7;
    // deterministic pseudo-random
    let s = 1337;
    const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    // weeks (0 = ~one year ago) that map to Maria's real care events get a spike
    const spikes = { 30: 3, 31: 2, 38: 2, 48: 3, 51: 4, 52: 3 }; // physical, psych, ER clusters
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

  // Months row for the heatmap
  const months = document.getElementById('cal-months');
  if (months) {
    const order = ['Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May'];
    months.innerHTML = order.map((m) => `<span style="flex:1">${m}</span>`).join('');
  }
})();
