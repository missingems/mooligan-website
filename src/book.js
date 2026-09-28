(() => {
  const runhead = document.querySelector('.runhead');
  const title = document.getElementById('rh-title');
  const folio = document.getElementById('rh-folio');
  const cover = document.getElementById('cover');
  const ribbon = document.getElementById('ribbon');
  const KEY = 'mooligan:page';

  // Only the marks that start a section of the book; pages inside the
  // columns sit side by side, so the running head gives each part’s range.
  const marks = [...document.querySelectorAll('[data-folio]')].filter(m => !m.closest('.cols'));
  const range = m => {
    const part = m.closest('.part');
    if (!part) return m.dataset.folio;
    const inner = part.querySelectorAll('.cols [data-folio]');
    return inner.length ? m.dataset.folio + '–' + inner[inner.length - 1].dataset.folio : m.dataset.folio;
  };

  const store = {
    get() { try { return localStorage.getItem(KEY); } catch { return null; } },
    set(v) { try { localStorage.setItem(KEY, v); } catch {} },
  };

  // The ribbon keeps your place between visits.
  const saved = store.get();
  const savedMark = saved && document.getElementById(saved);
  if (savedMark && !['pv', 'pvii'].includes(saved)) {
    ribbon.href = '#' + saved;
    ribbon.setAttribute('aria-label', 'Resume reading at page ' + savedMark.dataset.folio);
    ribbon.querySelector('span').textContent = 'p. ' + savedMark.dataset.folio;
  }

  let current = null;
  let ticking = false;

  function update() {
    ticking = false;
    runhead.classList.toggle('shown', cover.getBoundingClientRect().bottom < 40);

    const line = innerHeight * 0.3;
    let mark = null;
    for (const m of marks) {
      if (m.getBoundingClientRect().top <= line) mark = m;
      else break;
    }
    if (mark === current) return;
    current = mark;
    if (!mark) { title.textContent = ''; folio.textContent = ''; return; }

    const section = mark.closest('[data-head]');
    title.textContent = mark.dataset.head || (section ? section.dataset.head : '');
    folio.textContent = range(mark);
    store.set(mark.id);
  }

  addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }, { passive: true });
  addEventListener('resize', update);
  update();
})();
