(() => {
  const contents = document.querySelector('.contents');
  const features = [...contents.querySelectorAll('.feature')];   // what the columns hold
  const tasks = [...contents.querySelectorAll('details.task')];   // what opens
  const root = document.documentElement;

  // ——— Columns ———
  // One column if every task fits on the screen; otherwise as many columns as it takes,
  // up to as many as the width allows. Features (a task, or a feature with its directory of
  // parts) keep their order and are split so the columns come out as even as they can. Only
  // closed heights count, so opening a task lengthens its own column and never moves the others.
  const SINGLE = 36;   // rem: the width of the page as one column
  const COLUMN = 20;   // rem: the widest a column gets when there are several
  const MIN = 15;      // rem: the narrowest a column may be
  const GAP = 3;       // rem: between columns

  const px = rem => rem * parseFloat(getComputedStyle(root).fontSize);

  // The fewest columns whose tallest column is no taller than `limit`, filling in order.
  function split(heights, n) {
    const fill = cap => {
      const cols = [[]];
      let sum = 0;
      heights.forEach((h, i) => {
        if (sum + h > cap && cols.at(-1).length) { cols.push([]); sum = 0; }
        cols.at(-1).push(i);
        sum += h;
      });
      return cols;
    };
    let lo = Math.max(...heights), hi = heights.reduce((a, b) => a + b, 0);
    while (hi - lo > 0.5) {
      const mid = (lo + hi) / 2;
      if (fill(mid).length <= n) hi = mid; else lo = mid;
    }
    return { cols: fill(hi), tallest: hi };
  }

  // A feature’s height with every task in it closed.
  const closed = f => [...f.querySelectorAll('details.task[open]')].reduce(
    (h, d) => h - (d.getBoundingClientRect().height - d.querySelector('summary').getBoundingClientRect().height),
    f.getBoundingClientRect().height);

  function measure(width) {
    contents.style.width = width + 'px';
    const heights = features.map((f, i) =>
      closed(f) + (i && f.classList.contains('gs') ? parseFloat(getComputedStyle(f).marginTop) : 0));
    contents.style.width = '';
    return heights;
  }

  function layout() {
    // Start again from one plain list, as if there were no columns.
    contents.classList.remove('laid-out');
    contents.replaceChildren(...features);
    root.style.removeProperty('--page');

    const room = innerHeight - parseFloat(getComputedStyle(contents).paddingTop) - px(1.5);
    const gutter = Math.min(40, Math.max(16, 0.04 * root.clientWidth));   // as --gutter in the CSS
    const across = root.clientWidth - 2 * gutter;
    const most = Math.max(1, Math.floor((across + px(GAP)) / (px(MIN) + px(GAP))));

    let n = 1, cols, width = Math.min(across, px(SINGLE));
    for (; n <= most; n++) {
      width = n === 1 ? Math.min(across, px(SINGLE)) : Math.min((across - (n - 1) * px(GAP)) / n, px(COLUMN));
      const result = split(measure(width), n);
      cols = result.cols;
      if (result.tallest <= room || n === most) break;
    }

    // Move the features into their columns (moving keeps each task open or closed).
    contents.replaceChildren(...cols.map(ids => {
      const col = document.createElement('div');
      col.className = 'col';
      col.append(...ids.map(i => features[i]));
      return col;
    }));
    contents.classList.add('laid-out');
    root.style.setProperty('--page', n === 1 ? SINGLE + 'rem' : `${(width * n + px(GAP) * (n - 1)) / px(1)}rem`);
  }

  let pending = 0;
  const relayout = () => { cancelAnimationFrame(pending); pending = requestAnimationFrame(layout); };
  addEventListener('resize', relayout);
  document.fonts?.ready.then(relayout);
  layout();

  // ——— Opening tasks ———
  // Opens the task named in the address, keeps the address in step with the task opened
  // last, and opens every task before printing.
  const show = () => {
    const d = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (d && d.matches('details.task')) { d.open = true; d.scrollIntoView({ block: 'start' }); }
  };
  for (const d of tasks) d.addEventListener('toggle', () => {
    if (d.open) history.replaceState(null, '', '#' + d.id);
    else if (location.hash === '#' + d.id) history.replaceState(null, '', location.pathname + location.search);
  });
  addEventListener('hashchange', show);
  addEventListener('beforeprint', () => tasks.forEach(d => { d.open = true; }));
  show();
})();
