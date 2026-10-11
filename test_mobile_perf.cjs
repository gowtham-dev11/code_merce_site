const puppeteer = require('puppeteer-core');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://localhost:4173/';

async function runMobileAudit() {
  console.log('--- STARTING MOBILE PERFORMANCE AUDIT (390x844) ---');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=390,844'],
  });

  const page = await browser.newPage();
  await page.setViewport({
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 1200));

  await page.screenshot({ path: 'shot_perf_mobile_0_home.png' });
  console.log('Saved shot_perf_mobile_0_home.png');

  // Scroll to midpoint 2100px (mobile scrollDistance is 4200)
  await page.evaluate(() => window.scrollTo(0, 2100));
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: 'shot_perf_mobile_midpoint.png' });
  console.log('Saved shot_perf_mobile_midpoint.png');

  // Scroll to full 4200px
  await page.evaluate(() => window.scrollTo(0, 4200));
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: 'shot_perf_mobile_4200_about.png' });
  console.log('Saved shot_perf_mobile_4200_about.png');

  // Reverse scroll back to 0
  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: 'shot_perf_mobile_reverse_home.png' });
  console.log('Saved shot_perf_mobile_reverse_home.png');

  console.log('--- MOBILE PERFORMANCE AUDIT COMPLETE ---');
  await browser.close();
}

runMobileAudit().catch((err) => {
  console.error('Mobile audit failed:', err);
  process.exit(1);
});
