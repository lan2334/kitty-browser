const { launch } = require('kitty-browser');
function sleep(seconds) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}
async function main() {
  const browser = await launch({
    headless: false,
    humanize: true,

    turnstile: true,
    chromeUserAgent: {
      platform: 'MacOS',
      version: 146,
    },
    launchOptions: {
      defaultViewport: null,
    },
    args: ['--start-maximized'],
  });

  const page = (await browser.pages())[0] || (await browser.newPage());

  await page.goto('https://captcha.dstatbot.win/AB5Tr7pN', {
    waitUntil: 'domcontentloaded',
  });
  await sleep(10)
  console.log('UA:', await page.evaluate(() => navigator.userAgent));
  console.log('Title:', await page.title());

  await new Promise((resolve) => setTimeout(resolve, 30000));
  await browser.close();
}

main().catch((error) => {
  console.error('Demo failed:', error);
  process.exitCode = 1;
});
