import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome', headless: true });
const p = await (await b.newContext({ viewport:{width:900,height:480}, deviceScaleFactor:2 })).newPage();
await p.goto('file:///private/tmp/claude-501/-Users-peter-Documents-martinpeter10-github-io/9c20efd3-96b0-4c92-a3fb-512de262ece6/scratchpad/shrimp.html');
await p.waitForTimeout(500);
await p.screenshot({ path: 'shrimp.png' });
await b.close();
