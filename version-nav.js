// Direct HTML links work on local files, hosted pages, and without JavaScript.
const timeline = document.querySelector('.version-timeline');

if (timeline) {
  const track = timeline.querySelector('.timeline-track');
  const ticks = [...track.querySelectorAll('a')];
  const readout = timeline.querySelector('.timeline-position');
  const viewed = ticks.findIndex(tick => tick.hasAttribute('aria-current'));
  const design = document.querySelector('link[rel="stylesheet"]');
  const shared = document.querySelector('link[href$="version-nav.css"]');
  let selected = viewed;
  let timer;
  let wheelDelta = 0;
  let drag = null;
  let suppressClick = false;
  let previewStyle = null;
  let pendingStyle = null;

  const clamp = index => Math.max(0, Math.min(ticks.length - 1, index));

  function lens(center) {
    ticks.forEach((tick, index) => {
      const proximity = Math.exp(-Math.abs(index - center) * .55);
      tick.style.setProperty('--tick-scale', .24 + .76 * proximity);
      tick.style.setProperty('--tick-opacity', .38 + .54 * proximity);
    });
  }

  function reveal(index) {
    const tick = ticks[index];
    const top = tick.offsetTop - track.offsetTop;
    if (top < track.scrollTop) track.scrollTop = top;
    else if (top + tick.offsetHeight > track.scrollTop + track.clientHeight) {
      track.scrollTop = top + tick.offsetHeight - track.clientHeight;
    }
  }

  function preview(index) {
    if (pendingStyle) { pendingStyle.remove(); pendingStyle = null; }
    if (index === viewed) {
      design.disabled = false;
      if (previewStyle) { previewStyle.remove(); previewStyle = null; }
      return;
    }
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = new URL('styles.css', ticks[index].href).href;
    stylesheet.media = 'not all';
    pendingStyle = stylesheet;
    stylesheet.addEventListener('load', () => {
      if (selected !== index || pendingStyle !== stylesheet) { stylesheet.remove(); return; }
      stylesheet.media = 'all';
      design.disabled = true;
      if (previewStyle) previewStyle.remove();
      previewStyle = stylesheet;
      pendingStyle = null;
    });
    stylesheet.addEventListener('error', () => {
      stylesheet.remove();
      if (pendingStyle === stylesheet) pendingStyle = null;
    });
    shared.before(stylesheet);
  }

  function select(index) {
    index = clamp(index);
    const changed = selected !== index;
    selected = index;
    ticks.forEach((tick, i) => {
      tick.classList.toggle('is-selected', i === selected);
      tick.tabIndex = i === selected ? 0 : -1;
    });
    lens(selected);
    reveal(selected);
    readout.textContent = `${ticks[selected].dataset.version.padStart(2, '0')} / ${String(ticks.length).padStart(2, '0')}`;
    timeline.dataset.interacting = 'true';
    if (changed) preview(selected);
  }

  function reset() {
    clearTimeout(timer);
    wheelDelta = 0;
    select(viewed);
    timeline.dataset.interacting = 'false';
  }

  function commit() {
    clearTimeout(timer);
    if (selected !== viewed) window.location.assign(ticks[selected].href);
    else reset();
  }

  function settle(delay = 220) {
    clearTimeout(timer);
    timer = setTimeout(commit, delay);
  }

  function atPointer(y) {
    const bounds = track.getBoundingClientRect();
    return clamp(Math.round((y - bounds.top + track.scrollTop - 4) / 24 - .5));
  }

  ticks.forEach((tick, index) => { tick.tabIndex = index === viewed ? 0 : -1; });
  reveal(viewed);

  timeline.addEventListener('wheel', event => {
    if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? track.clientHeight : 1;
    wheelDelta += event.deltaY * unit;
    const steps = Math.trunc(wheelDelta / 40);
    if (steps) {
      wheelDelta -= steps * 40;
      select(selected + steps);
    }
    if (selected !== viewed) settle();
  }, { passive: false });

  track.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    clearTimeout(timer);
    drag = event.pointerId;
    timeline.dataset.dragging = 'true';
    track.setPointerCapture(event.pointerId);
    select(atPointer(event.clientY));
    event.preventDefault();
  });

  track.addEventListener('pointermove', event => {
    if (drag === event.pointerId) select(atPointer(event.clientY));
    else if (event.pointerType === 'mouse') lens(atPointer(event.clientY));
  });

  track.addEventListener('pointerup', event => {
    if (drag !== event.pointerId) return;
    drag = null;
    timeline.dataset.dragging = 'false';
    track.releasePointerCapture(event.pointerId);
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 0);
    commit();
  });

  track.addEventListener('pointercancel', () => {
    drag = null;
    timeline.dataset.dragging = 'false';
    reset();
  });

  track.addEventListener('click', event => {
    if (suppressClick) event.preventDefault();
  });

  timeline.addEventListener('pointerleave', () => {
    if (drag === null) {
      lens(selected);
      if (selected === viewed) timeline.dataset.interacting = 'false';
    }
  });

  timeline.addEventListener('keydown', event => {
    const moves = { ArrowUp: -1, ArrowDown: 1, PageUp: -5, PageDown: 5 };
    let next;
    if (event.key in moves) next = selected + moves[event.key];
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = ticks.length - 1;
    else if (event.key === 'Escape') {
      event.preventDefault();
      reset();
      ticks[viewed].focus({ preventScroll: true });
      return;
    } else if (event.key === 'Enter') {
      event.preventDefault();
      commit();
      return;
    } else return;
    event.preventDefault();
    select(next);
    ticks[selected].focus({ preventScroll: true });
    settle(350);
  });

  // A cached page must restore its own design, not the preview used to leave it.
  window.addEventListener('pageshow', () => {
    drag = null;
    timeline.dataset.dragging = 'false';
    reset();
  });
}
