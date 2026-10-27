const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const studies = require('../motion-studies.js');

test('six distinct studies evolve while retaining stable geometry and bounded coordinates', () => {
  const signatures = new Set();
  for(const name of studies.names) {
    const initial = studies.frame(name,0);
    signatures.add(initial.paths[0].d);
    assert.notEqual(studies.frame(name,2).paths[0].d,initial.paths[0].d,`${name} should evolve`);
    for(const time of [0,2,30,120,600]) {
      const frame = studies.frame(name,time);
      assert.equal(frame.paths.length,initial.paths.length);
      assert.equal(frame.points.length,initial.points.length);
      for(const strand of frame.paths) {
        assert.ok(!/NaN|Infinity/.test(strand.d));
        assert.ok(strand.opacity>=0 && strand.opacity<=1);
        for(const value of strand.d.match(/-?\d+(?:\.\d+)?/g)||[]) assert.ok(Number(value)>=0 && Number(value)<=520,`${name}: ${value} outside artwork`);
      }
      for(const point of frame.points) {
        assert.ok(point.x>=0 && point.x<=520 && point.y>=0 && point.y<=520);
        assert.ok(point.r>0 && point.opacity>=0 && point.opacity<=1);
      }
    }
  }
  assert.equal(signatures.size,6);
});

test('static and reduced-motion posters match the first frame', () => {
  const root = path.resolve(__dirname,'..');
  for(const page of ['index.html',...Array.from({length:6},(_,i)=>`versions/${i+10}/index.html`)]) {
    const html = fs.readFileSync(path.join(root,page),'utf8');
    const name = html.match(/data-motion-study="([a-z]+)"/)[1];
    const frame = studies.frame(name,0);
    const artwork = html.match(/<g class="contours"[^>]*>([\s\S]*?)<\/g>/)[1];
    const paths = [...artwork.matchAll(/<path d="([^"]*)"/g)].map(match=>match[1]);
    assert.deepEqual(paths,frame.paths.map(p=>p.d),page);
  }
});
