// Refresh static/reduced-motion posters after changing motion-studies.js.
const fs = require('node:fs');
const path = require('node:path');
const studies = require('../motion-studies.js');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'versions.json')));
const pages = ['index.html', ...manifest.versions.map(v=>`versions/${v.id}/index.html`)];
let count = 0;
for(const page of pages) {
  const file = path.join(root,page), document = fs.readFileSync(file,'utf8');
  const match = document.match(/<div class="ambient-art"[^>]*data-motion-study="([a-z]+)"/);
  if(!match)continue;
  const frame = studies.frame(match[1],0);
  const paths = frame.paths.map(p=>`<path d="${p.d}" stroke-opacity="${p.opacity}"${p.accent?' stroke="var(--accent)"':''}/>`).join('');
  const points = frame.points.map(p=>`<circle class="study-point" cx="${p.x}" cy="${p.y}" r="${p.r}" opacity="${p.opacity}"/>`).join('');
  const svg = `<svg viewBox="0 0 520 520" xmlns="http://www.w3.org/2000/svg" focusable="false"><g class="art-drift"><g class="contours" fill="none" stroke-width="1">${paths}</g><g class="study-tracers">${points}</g></g></svg>`;
  fs.writeFileSync(file,document.replace(/(<div class="ambient-art"[^>]*>\s*)<svg\b[\s\S]*?<\/svg>/,(_,before)=>before+svg));
  count++;
}
console.log(`Rendered ${count} static motion-study posters.`);
