const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://localhost:4173/';

async function runPerformanceAudit() {
  console.log('--- STARTING CODEMERCE PERFORMANCE AUDIT ---');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--window-size=1920,1080',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });

  const consoleLogs = [];
  const networkRequests = [];
  const networkErrors = [];

  page.on('console', (msg) => {
    consoleLogs.push({ type: msg.type(), text: msg.text() });
  });

  page.on('requestfailed', (req) => {
    networkErrors.push({ url: req.url(), failure: req.failure() });
  });

  page.on('response', (res) => {
    const url = res.url();
    if (url.includes('/bunny-frames/')) {
      networkRequests.push({
        url,
        status: res.status(),
        isWebp: url.endsWith('.webp'),
        isJpg: url.endsWith('.jpg'),
        contentType: res.headers()['content-type'],
      });
    }
  });

  const startTime = Date.now();
  console.log('Navigating to', URL);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  const domLoadedTime = Date.now() - startTime;
  console.log(`DOM Loaded in ${domLoadedTime}ms`);

  // Wait 1.5s for initial preloader tier 1 & 2
  await page.waitForTimeout ? page.waitForTimeout(1500) : new Promise((r) => setTimeout(r, 1500));

  // Screenshot at scroll 0 (Home initial)
  await page.screenshot({ path: 'shot_perf_0_home.png' });
  console.log('Saved shot_perf_0_home.png');

  // Verify canvas is drawing
  const canvasCheck = await page.evaluate(() => {
    const canvas = document.getElementById('bunny-canvas');
    if (!canvas) return { exists: false };
    const ctx = canvas.getContext('2d');
    const pixel = ctx.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data;
    return {
      exists: true,
      width: canvas.width,
      height: canvas.height,
      centerPixel: Array.from(pixel),
    };
  });
  console.log('Canvas state:', canvasCheck);

  // Measure scroll scrub performance down to 6000px
  console.log('Beginning scroll simulation down to 6000px...');
  const scrollSteps = 60; // 60 increments
  const maxScroll = 6000;
  const scrollIntervalMs = 25; // simulate ~40 scrolls/sec

  const scrollFrameDurations = [];
  for (let i = 1; i <= scrollSteps; i++) {
    const targetScrollY = Math.round((i / scrollSteps) * maxScroll);
    const t0 = Date.now();
    await page.evaluate((y) => window.scrollTo(0, y), targetScrollY);
    await new Promise((r) => setTimeout(r, scrollIntervalMs));
    const dt = Date.now() - t0;
    scrollFrameDurations.push(dt);

    if (targetScrollY === 1500) {
      await page.screenshot({ path: 'shot_perf_1500_exit.png' });
      console.log('Saved shot_perf_1500_exit.png');
    } else if (targetScrollY === 2300) {
      await page.screenshot({ path: 'shot_perf_2300_clear.png' });
      console.log('Saved shot_perf_2300_clear.png');
    } else if (targetScrollY === 3000) {
      await page.screenshot({ path: 'shot_perf_3000_about_enter.png' });
      console.log('Saved shot_perf_3000_about_enter.png');
    }
  }

  // Final scroll state (full About)
  await page.screenshot({ path: 'shot_perf_6000_about_full.png' });
  console.log('Saved shot_perf_6000_about_full.png');

  // Inspect About DOM state
  const aboutState = await page.evaluate(() => {
    const home = document.querySelector('div[style*="opacity"]');
    const nav = document.querySelector('nav');
    const activeBtn = nav ? nav.querySelector('.text-orange-400') : null;
    return {
      scrollY: window.scrollY,
      activeNavText: activeBtn ? activeBtn.textContent.trim() : null,
    };
  });
  console.log('Full About state:', aboutState);

  // Reverse scroll scrub back to 0px
  console.log('Simulating reverse scroll back to 0px...');
  for (let i = scrollSteps - 1; i >= 0; i--) {
    const targetScrollY = Math.round((i / scrollSteps) * maxScroll);
    await page.evaluate((y) => window.scrollTo(0, y), targetScrollY);
    await new Promise((r) => setTimeout(r, scrollIntervalMs / 2));
  }

  await page.screenshot({ path: 'shot_perf_reverse_0_home.png' });
  console.log('Saved shot_perf_reverse_0_home.png');

  // Wait 1.5s to let remaining background pipeline finish
  await new Promise((r) => setTimeout(r, 1500));

  const totalLoadedFrames = await page.evaluate(() => {
    // Check window / canvas
    const canvas = document.getElementById('bunny-canvas');
    return {
      scrollY: window.scrollY,
      canvasWidth: canvas ? canvas.width : 0,
      canvasHeight: canvas ? canvas.height : 0,
    };
  });

  const webpRequests = networkRequests.filter((r) => r.isWebp);
  const jpgRequests = networkRequests.filter((r) => r.isJpg);

  const avgScrollDelta =
    scrollFrameDurations.reduce((a, b) => a + b, 0) / scrollFrameDurations.length;
  const maxScrollDelta = Math.max(...scrollFrameDurations);

  const report = {
    domLoadedTimeMs: domLoadedTime,
    totalFramesRequested: networkRequests.length,
    webpFramesLoaded: webpRequests.length,
    jpgFramesLoaded: jpgRequests.length,
    networkErrorsCount: networkErrors.length,
    networkErrors,
    consoleLogsCount: consoleLogs.length,
    consoleWarningsOrErrors: consoleLogs.filter(
      (l) => l.type === 'error' || l.type === 'warning'
    ),
    scrollPerformance: {
      averageFrameIntervalMs: Math.round(avgScrollDelta),
      maxFrameIntervalMs: maxScrollDelta,
      scrollStepsTested: scrollSteps,
    },
    finalCanvas: totalLoadedFrames,
  };

  fs.writeFileSync('perf_audit_results.json', JSON.stringify(report, null, 2));
  console.log('--- PERFORMANCE AUDIT COMPLETE ---');
  console.log(JSON.stringify(report, null, 2));

  await browser.close();
}

runPerformanceAudit().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
