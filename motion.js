// A shared, quiet motion study: harmonic threads, coupled orbits, and a
// perspective projection of a Möbius ribbon. No animation work runs offscreen.
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const svgNS = 'http://www.w3.org/2000/svg';
  const basis = u => ({ cos: Math.cos(u), sin: Math.sin(u), halfCos: Math.cos(u / 2), halfSin: Math.sin(u / 2) });
  const samples = Array.from({ length: 145 }, (_, i) => basis(i / 144 * Math.PI * 4));
  let content;
  let field;
  let wave;
  let circles = false;
  let frame = 0;
  let previous = 0;
  let elapsed = 0;

  function clear() {
    if (field) {
      field.paths.forEach((path, i) => {
        path.setAttribute('d', field.originalPaths[i]);
        path.removeAttribute('stroke-opacity');
      });
      for (const [name, value] of Object.entries(field.originalDot)) field.dot.setAttribute(name, value);
      field.dot.removeAttribute('fill-opacity');
      field.element.removeAttribute('data-motion-field');
    }
    if (wave) {
      wave.element.remove();
      wave.copy.removeAttribute('data-motion-wave');
    }
    document.body.removeAttribute('data-motion-circles');
    field = wave = null;
    circles = false;
  }

  function mount() {
    clear();
    content = document.querySelector('.content');
    if (!content || reduced.matches) { schedule(); return; }

    const art = content.querySelector('.ambient-art');
    if (art) {
      const paths = [...art.querySelectorAll('.contours path')];
      const dot = art.querySelector('.art-orbit');
      if (paths.length && dot) {
        field = {
          element: art, paths, dot,
          originalPaths: paths.map(path => path.getAttribute('d')),
          originalDot: Object.fromEntries(['cx', 'cy', 'r'].map(name => [name, dot.getAttribute(name)])),
          width: paths.length < 9 ? 30 : paths.length < 18 ? 39 : 46,
        };
        art.setAttribute('data-motion-field', '');
      }
    }

    const copy = content.querySelector('.intro-copy');
    if (copy && !art) {
      const line = getComputedStyle(copy, '::after');
      if (line.content !== 'none' && line.display !== 'none') {
        const element = document.createElementNS(svgNS, 'svg');
        element.setAttribute('viewBox', '0 0 96 16');
        element.setAttribute('aria-hidden', 'true');
        element.setAttribute('focusable', 'false');
        element.classList.add('wave-thread');
        const paths = Array.from({ length: 3 }, () => {
          const path = document.createElementNS(svgNS, 'path');
          element.append(path);
          return path;
        });
        copy.setAttribute('data-motion-wave', '');
        copy.append(element);
        wave = { copy, element, paths };
      }
    }

    const circle = getComputedStyle(document.body, '::before');
    circles = circle.content !== 'none' && circle.display !== 'none';
    if (circles) document.body.setAttribute('data-motion-circles', '');
    draw(elapsed);
    schedule();
  }

  function ribbonPose(t) {
    const twist = .22 * Math.sin(t * .13);
    const angle = .06 * Math.sin(t * .08);
    const tilt = .57 + .08 * Math.sin(t * .09);
    const turn = .18 * Math.sin(t * .07);
    const roll = -.38 + .05 * Math.sin(t * .08);
    return {
      ct: Math.cos(twist), st: Math.sin(twist), ca: Math.cos(angle), sa: Math.sin(angle),
      cx: Math.cos(tilt), sx: Math.sin(tilt), cy: Math.cos(turn), sy: Math.sin(turn),
      cz: Math.cos(roll), sz: Math.sin(roll),
    };
  }

  function ribbonPoint(b, v, pose) {
    // The half twist joins the two sides after two turns around the ribbon.
    const radius = 142 + v * (b.halfCos * pose.ct - b.halfSin * pose.st);
    const x = radius * (b.cos * pose.ca - b.sin * pose.sa);
    const y = radius * (b.sin * pose.ca + b.cos * pose.sa);
    const z = v * (b.halfSin * pose.ct + b.halfCos * pose.st);
    const y1 = y * pose.cx - z * pose.sx;
    const z1 = y * pose.sx + z * pose.cx;
    const x1 = x * pose.cy + z1 * pose.sy;
    const depth = -x * pose.sy + z1 * pose.cy;
    const perspective = 650 / (650 - depth);
    return {
      x: 260 + (x1 * pose.cz - y1 * pose.sz) * perspective,
      y: 260 + (x1 * pose.sz + y1 * pose.cz) * perspective,
      depth, perspective,
    };
  }

  function draw(t) {
    if (field) {
      const pose = ribbonPose(t);
      field.paths.forEach((path, i) => {
        const v = 3 + field.width * (i + 1) / field.paths.length;
        let d = '';
        for (let j = 0; j <= 144; j++) {
          const p = ribbonPoint(samples[j], v, pose);
          d += `${j ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`;
        }
        path.setAttribute('d', d + 'Z');
        path.setAttribute('stroke-opacity', (.3 + .35 * (i + 1) / field.paths.length).toFixed(2));
      });
      // The accent follows the ribbon's surface, including perspective depth.
      const p = ribbonPoint(basis(-.55 + t * .18), field.width * .9, pose);
      field.dot.setAttribute('cx', p.x.toFixed(2));
      field.dot.setAttribute('cy', p.y.toFixed(2));
      field.dot.setAttribute('r', (20 * p.perspective).toFixed(2));
      field.dot.setAttribute('fill-opacity', Math.max(.45, Math.min(.9, .68 + p.depth / 500)).toFixed(2));
    }
    if (wave) {
      wave.paths.forEach((path, strand) => {
        let d = '';
        for (let i = 0; i <= 48; i++) {
          const u = i / 48;
          const envelope = Math.sin(Math.PI * u);
          const y = 8 + envelope * (
            2.8 * Math.sin(u * Math.PI * 4 - t * .8 + strand * 1.7) +
            1.1 * Math.sin(u * Math.PI * 6 + t * .5 + strand)
          );
          d += `${i ? 'L' : 'M'}${(u * 96).toFixed(2)},${y.toFixed(2)}`;
        }
        path.setAttribute('d', d);
      });
    }
    if (circles) {
      // Incommensurate frequencies make coupled trajectories without a loop seam.
      const style = document.body.style;
      style.setProperty('--circle-x', `${(3 * Math.sin(t * .17) + 1.3 * Math.sin(t * .17 * Math.SQRT2)).toFixed(3)}%`);
      style.setProperty('--circle-y', `${(1.6 * Math.cos(t * .13) + .8 * Math.sin(t * .13 * Math.sqrt(3))).toFixed(3)}%`);
      style.setProperty('--circle-other-x', `${(2.4 * Math.cos(t * .11 + .8)).toFixed(3)}%`);
      style.setProperty('--circle-other-y', `${(4.5 * Math.sin(t * .15) + Math.sin(t * .15 * Math.SQRT2)).toFixed(3)}%`);
    }
  }

  function tick(now) {
    frame = 0;
    if (previous && now - previous < 32) { frame = requestAnimationFrame(tick); return; }
    if (previous) elapsed += Math.min(now - previous, 100) / 1000;
    previous = now;
    draw(elapsed);
    frame = requestAnimationFrame(tick);
  }

  function schedule() {
    cancelAnimationFrame(frame);
    frame = previous = 0;
    if (!document.hidden && !reduced.matches && (field || wave || circles)) frame = requestAnimationFrame(tick);
  }

  // Timeline previews replace .content. Keep one animation loop for the visible page.
  new MutationObserver(() => {
    if (document.querySelector('.content') !== content) mount();
  }).observe(document.body, { childList: true });
  reduced.addEventListener('change', mount);
  document.addEventListener('visibilitychange', schedule);
  window.addEventListener('pageshow', schedule);
  mount();
})();
