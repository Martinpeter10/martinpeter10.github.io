// Trace krillion's icon.png into a compact monochrome SVG path.
// Chrome does the PNG decoding; we just read the alpha channel.
import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome', headless: true });
const p = await (await b.newContext()).newPage();
await p.goto('file:///private/tmp/claude-501/-Users-peter-Documents-martinpeter10-github-io/9c20efd3-96b0-4c92-a3fb-512de262ece6/scratchpad/zoomdata.html');
await p.waitForTimeout(300);

const out = await p.evaluate(async (N) => {
  const img = document.querySelector('img');
  await img.decode();
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.drawImage(img, 0, 0, N, N);
  const d = g.getImageData(0, 0, N, N).data;
  const grid = [];
  for (let y = 0; y < N; y++) {
    const row = [];
    for (let x = 0; x < N; x++) row.push(d[(y * N + x) * 4 + 3] > 110 ? 1 : 0);
    grid.push(row);
  }
  return grid;
}, 56);

await b.close();

// Trim to the drawn bounds, then scale into a 24x24 viewBox.
let minX = 99, minY = 99, maxX = -1, maxY = -1;
out.forEach((row, y) => row.forEach((v, x) => {
  if (!v) return;
  if (x < minX) minX = x; if (x > maxX) maxX = x;
  if (y < minY) minY = y; if (y > maxY) maxY = y;
}));
const w = maxX - minX + 1, h = maxY - minY + 1;
const span = Math.max(w, h);
const S = 22 / span;                       // leave a little padding in 24 units
const ox = (24 - w * S) / 2, oy = (24 - h * S) / 2;
const f = (n) => Math.round(n * 100) / 100;

// Merge each row's filled cells into horizontal runs -> one rect per run.
const parts = [];
for (let y = minY; y <= maxY; y++) {
  let x = minX;
  while (x <= maxX) {
    if (!out[y][x]) { x++; continue; }
    let x2 = x;
    while (x2 + 1 <= maxX && out[y][x2 + 1]) x2++;
    const px = ox + (x - minX) * S, py = oy + (y - minY) * S;
    parts.push(`M${f(px)} ${f(py)}h${f((x2 - x + 1) * S)}v${f(S)}h-${f((x2 - x + 1) * S)}z`);
    x = x2 + 1;
  }
}
const path = parts.join('');
console.log('cells', w + 'x' + h, 'runs', parts.length, 'path chars', path.length);
import fs from 'fs';
fs.writeFileSync('/private/tmp/claude-501/-Users-peter-Documents-martinpeter10-github-io/9c20efd3-96b0-4c92-a3fb-512de262ece6/scratchpad/traced.txt', path);
