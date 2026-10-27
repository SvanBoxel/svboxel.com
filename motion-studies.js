// Pure geometry shared by the browser and the static poster renderer.
((root) => {
  const line = (points, close = false) => points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join('') + (close ? 'Z' : '');
  const strand = (points, opacity = .45, accent = false) => ({ d: line(points), opacity, accent });
  const sample = (count, point) => Array.from({ length: count + 1 }, (_, i) => point(i / count));

  function project(x, y, z, tilt = .6, roll = -.2) {
    const yp = y * Math.cos(tilt) - z * Math.sin(tilt);
    const depth = y * Math.sin(tilt) + z * Math.cos(tilt);
    const scale = 900 / (900 - depth);
    return { x: 260 + (x * Math.cos(roll) - yp * Math.sin(roll)) * scale, y: 260 + (x * Math.sin(roll) + yp * Math.cos(roll)) * scale };
  }

  function marker(points, phase, r = 2.5) {
    const u = ((phase % 1) + 1) % 1;
    const index = u * (points.length - 1);
    const a = points[Math.floor(index)], b = points[Math.min(points.length - 1, Math.floor(index) + 1)];
    const f = index % 1;
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, r, opacity: .65 * Math.sin(Math.PI * u) ** 2 };
  }

  function sheet(u, v, t, woven) {
    if (woven) {
      const z = 24 * Math.sin(Math.PI * (u + v) - t * .18) + 6 * Math.cos(Math.PI * (2 * u - v) + t * .11);
      return project(175 * u, 135 * v, z, .64, -.23);
    }
    const twist = .7 * u + .3 * Math.sin(t * .12);
    return project(190 * u, 42 * Math.sin(u * Math.PI * 1.25 - t * .15) + 82 * v * Math.cos(twist),
      28 * Math.cos(u * Math.PI + t * .1) + 82 * v * Math.sin(twist), .58, -.17);
  }

  function fabric(t, woven) {
    const paths = [], curves = [];
    for (let i = 0; i < 26; i++) {
      const v = i / 25 * 2 - 1;
      const points = sample(80, q => sheet(q * 2 - 1, v, t, woven));
      curves.push(points);
      paths.push(strand(points, .24 + .26 * Math.sin(Math.PI * i / 25), i === 12));
    }
    if (woven) for (let i = 0; i < 20; i++) {
      const u = i / 19 * 2 - 1;
      paths.push(strand(sample(64, q => sheet(u, q * 2 - 1, t, true)), .22, i === 8));
    }
    return { paths, points: [marker(curves[8], t * .035 + .18), marker(curves[18], -t * .028 + .72)] };
  }

  function interference(t) {
    const paths = [];
    for (let i = 0; i < 34; i++) {
      const y = (i / 33 * 2 - 1) * 160;
      paths.push(strand(sample(110, q => {
        const x = (q * 2 - 1) * 195;
        const d1 = Math.hypot(x + 73, y - 8), d2 = Math.hypot(x - 73, y + 8);
        const ripple = 11 * (Math.sin(d1 * .049 - t * .44) * Math.exp(-d1 / 300) + Math.sin(d2 * .049 - t * .44 + Math.PI / 3) * Math.exp(-d2 / 300));
        return { x: 260 + x, y: 260 + y + ripple };
      }), .23 + .3 * Math.sin(Math.PI * i / 33), i === 16));
    }
    return { paths, points: [] };
  }

  function height(x, y, t) {
    const a = -63 + 12 * Math.sin(t * .1), b = 86 + 10 * Math.cos(t * .09);
    const g1 = Math.exp(-((x - a) ** 2 / 115 ** 2 + (y - 12) ** 2 / 125 ** 2));
    const g2 = .84 * Math.exp(-((x - b) ** 2 / 95 ** 2 + (y + 35) ** 2 / 92 ** 2));
    const valley = .32 * Math.exp(-(x ** 2 / 65 ** 2 + (y - 68) ** 2 / 80 ** 2));
    return g1 + g2 - valley;
  }

  function contours(t) {
    // Marching squares extracts real level sets of the same surface seen in v14.
    const n = 72, step = 420 / n, values = [];
    for (let y = 0; y <= n; y++) for (let x = 0; x <= n; x++) values.push(height(x * step - 210, y * step - 210, t));
    const cases = [[], [[3,0]], [[0,1]], [[3,1]], [[1,2]], [[3,2],[0,1]], [[0,2]], [[3,2]], [[2,3]], [[0,2]], [[0,3],[1,2]], [[1,2]], [[1,3]], [[0,1]], [[3,0]], []];
    const paths = [];
    for (let level = 0; level < 18; level++) {
      const threshold = .12 + level * .064;
      let d = '';
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const a = values[y*(n+1)+x], b = values[y*(n+1)+x+1];
        const c = values[(y+1)*(n+1)+x+1], d0 = values[(y+1)*(n+1)+x];
        const code = (a>threshold?1:0)|(b>threshold?2:0)|(c>threshold?4:0)|(d0>threshold?8:0);
        if(code===0||code===15)continue;
        const v = [a,b,c,d0];
        let pairs = cases[code];
        if (code === 5 || code === 10) {
          const saddle = (a-threshold)*(c-threshold) - (b-threshold)*(d0-threshold);
          pairs = saddle > 0 ? [[0,1],[2,3]] : [[3,0],[1,2]];
        }
        const edge = e => {
          const vertices = [[x,y],[x+1,y],[x+1,y+1],[x,y+1]], a = e, b = (e+1)%4;
          const f = (threshold - v[a]) / (v[b] - v[a]);
          return { x: 50 + (vertices[a][0] + f*(vertices[b][0]-vertices[a][0]))*step, y: 50 + (vertices[a][1] + f*(vertices[b][1]-vertices[a][1]))*step };
        };
        for (const [a,b] of pairs) d += line([edge(a),edge(b)]);
      }
      paths.push({ d, opacity: .25 + level / 17 * .3, accent: level === 8 });
    }
    return { paths, points: [] };
  }

  function relief(t) {
    const paths = [], point = (x,y) => {
      const p = project(x, y, 84 * height(x,y,t) - 35, .98 + .06*Math.sin(t*.07), -.35);
      return { x:260+(p.x-260)*.88, y:260+(p.y-260)*.88 };
    };
    for (let i = 0; i < 28; i++) paths.push(strand(sample(70,q=>point(q*390-195,i/27*360-180)), .4, i===15));
    for (let i = 0; i < 16; i++) paths.push(strand(sample(64,q=>point(i/15*390-195,q*360-180)), .2));
    return { paths, points: [] };
  }

  function confluence(t) {
    // Trace an incompressible streamfunction's perpendicular gradient, normalized
    // only to sample the streamlines at even arc-length intervals.
    const ax = -.38 + .04*Math.sin(t*.09), ay = -.1 + .04*Math.cos(t*.08);
    const bx = .38 + .04*Math.cos(t*.07), by = .1 + .04*Math.sin(t*.1);
    const velocity = (x,y) => {
      const g1 = .75*Math.exp(-((x-ax)**2+(y-ay)**2)/.22);
      const g2 = .72*Math.exp(-((x-bx)**2+(y-by)**2)/.22);
      const vx = .55 - 2*(y-ay)/.22*g1 + 2*(y-by)/.22*g2;
      const vy = 2*(x-ax)/.22*g1 - 2*(x-bx)/.22*g2;
      const length = Math.hypot(vx,vy) || 1;
      return [vx/length,vy/length];
    };
    const seeds = Array.from({length:20},(_,i)=>[-1.13, -.98+i/19*1.96]);
    for (let i=0;i<8;i++) { seeds.push([ax+.06+i*.034,ay]); seeds.push([bx+.06+i*.034,by]); }
    const curves = seeds.map(seed => {
      let [x,y] = seed;
      const points = [];
      for (let i=0;i<180;i++) {
        points.push({x:260+x*174,y:260+y*174});
        const a=velocity(x,y), b=velocity(x+a[0]*.013,y+a[1]*.013);
        x+=b[0]*.026; y+=b[1]*.026;
        if(Math.abs(x)>1.18||Math.abs(y)>1.18||(i>40&&Math.hypot(x-seed[0],y-seed[1])<.022))break;
      }
      return points;
    });
    return { paths:curves.map((p,i)=>strand(p,i<20?.37:.23,i===9||i===27)), points:[3,9,14,18].map((i,j)=>marker(curves[i],t*.035+j*.23,2.1)) };
  }

  const studies = { fold:t=>fabric(t,false), weave:t=>fabric(t,true), interference, contours, relief, confluence };
  const api = { names:Object.keys(studies), frame:(name,t)=>studies[name](t) };
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.websiteMotionStudies=api;
})(globalThis);
