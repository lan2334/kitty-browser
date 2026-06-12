const SUPPORTED_PLATFORMS = {
  windows: 'Windows',
  linux: 'Linux',
  macos: 'MacOS',
};

const MIN_CHROME_VERSION = 140;
const MAX_CHROME_VERSION = 150;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldStartXvfb(options = {}) {
  return process.platform === 'linux' && options.headless === false && !process.env.DISPLAY && options.disableXvfb !== true;
}

async function startXvfbSessionIfNeeded(options = {}) {
  if (!shouldStartXvfb(options)) {
    return null;
  }

  let Xvfb;
  try {
    Xvfb = require('xvfb');
  } catch {
    throw new Error("Linux headful mode requires the 'xvfb' package. Run `npm install xvfb` and install the system package with `apt install -y xvfb`.");
  }

  try {
    const session = new Xvfb({
      silent: true,
      xvfb_args: ['-screen', '0', '1920x1080x24', '-ac'],
    });
    session.startSync();
    return session;
  } catch (error) {
    throw new Error(
      `Failed to start xvfb automatically. Make sure the system package is installed (for example: apt install -y xvfb). Original error: ${error.message}`
    );
  }
}

function attachXvfbLifecycle(browser, xvfbSession) {
  if (!xvfbSession) {
    return browser;
  }

  let stopped = false;
  const stopSession = () => {
    if (stopped) {
      return;
    }

    stopped = true;
    try {
      xvfbSession.stopSync();
    } catch {
    }
  };

  const originalClose = browser.close.bind(browser);
  browser.close = async (...args) => {
    try {
      return await originalClose(...args);
    } finally {
      stopSession();
    }
  };

  browser.on('disconnected', stopSession);
  return browser;
}

function normalizePlatform(platform) {
  const normalized = String(platform || '').trim().toLowerCase();

  if (normalized === 'windows' || normalized === 'win') {
    return SUPPORTED_PLATFORMS.windows;
  }

  if (normalized === 'linux') {
    return SUPPORTED_PLATFORMS.linux;
  }

  if (normalized === 'macos' || normalized === 'mac' || normalized === 'darwin' || normalized === 'osx') {
    return SUPPORTED_PLATFORMS.macos;
  }

  throw new Error("Unsupported platform. Use one of: 'Windows', 'Linux', 'MacOS'.");
}

function normalizeVersion(version) {
  const normalized = Number(version);

  if (!Number.isInteger(normalized) || normalized < MIN_CHROME_VERSION || normalized > MAX_CHROME_VERSION) {
    throw new Error(`Unsupported Chrome version ${version}. Supported range is ${MIN_CHROME_VERSION}-${MAX_CHROME_VERSION}.`);
  }

  return normalized;
}

function buildChromeUserAgent(platform, version) {
  const normalizedPlatform = normalizePlatform(platform);
  const normalizedVersion = normalizeVersion(version);

  if (normalizedPlatform === SUPPORTED_PLATFORMS.windows) {
    return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${normalizedVersion}.0.0.0 Safari/537.36`;
  }

  if (normalizedPlatform === SUPPORTED_PLATFORMS.linux) {
    return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${normalizedVersion}.0.0.0 Safari/537.36`;
  }

  return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${normalizedVersion}.0.0.0 Safari/537.36`;
}

function buildFingerprintArgs(args = [], chromeUserAgent) {
  if (!chromeUserAgent) {
    return [...args];
  }

  const normalizedVersion = normalizeVersion(chromeUserAgent.version);
  const nextArgs = args.filter(
    (arg) => !arg.startsWith('--fingerprint-brand=') && !arg.startsWith('--fingerprint-brand-version=')
  );

  nextArgs.push('--fingerprint-brand=Chrome');
  nextArgs.push(`--fingerprint-brand-version=${normalizedVersion}`);
  return nextArgs;
}

async function attemptRealBrowserStyleTurnstileClick(page) {
  const elements = await page.$$('[name="cf-turnstile-response"]');

  if (elements.length > 0) {
    for (const element of elements) {
      try {
        const parentElement = await element.evaluateHandle((el) => el.parentElement);
        const box = await parentElement.boundingBox();

        if (!box) {
          continue;
        }

        await page.mouse.click(box.x + 30, box.y + box.height / 2);
      } catch {
      }
    }

    return true;
  }

  const coordinates = await page.evaluate(() => {
    const matches = [];

    document.querySelectorAll('div').forEach((item) => {
      try {
        const rect = item.getBoundingClientRect();
        const css = window.getComputedStyle(item);

        if (
          css.margin === '0px' &&
          css.padding === '0px' &&
          rect.width > 290 &&
          rect.width <= 310 &&
          !item.querySelector('*')
        ) {
          matches.push({ x: rect.x, y: rect.y, height: rect.height });
        }
      } catch {
      }
    });

    if (matches.length > 0) {
      return matches;
    }

    document.querySelectorAll('div').forEach((item) => {
      try {
        const rect = item.getBoundingClientRect();

        if (rect.width > 290 && rect.width <= 310 && !item.querySelector('*')) {
          matches.push({ x: rect.x, y: rect.y, height: rect.height });
        }
      } catch {
      }
    });

    return matches;
  });

  for (const item of coordinates) {
    try {
      await page.mouse.click(item.x + 30, item.y + item.height / 2);
    } catch {
    }
  }

  return coordinates.length > 0;
}

function startTurnstileLoop(page, intervalMs = 1000) {
  if (page.__kittyTurnstileLoopStarted) {
    return;
  }

  page.__kittyTurnstileLoopStarted = true;
  page.__kittyTurnstileLoopActive = true;

  const stop = () => {
    page.__kittyTurnstileLoopActive = false;
  };

  page.on('close', stop);

  (async () => {
    while (page.__kittyTurnstileLoopActive) {
      try {
        await attemptRealBrowserStyleTurnstileClick(page);
      } catch {
      }

      await sleep(intervalMs);
    }
  })().catch(() => {
    page.__kittyTurnstileLoopActive = false;
  });
}

async function decoratePage(page, options) {
  if (page.__kittyBrowserDecorated) {
    return page;
  }

  page.__kittyBrowserDecorated = true;

  page.SetChromeUserAgent = async (platform, version) => {
    const userAgent = buildChromeUserAgent(platform, version);
    await page.setUserAgent(userAgent);
    page.__kittyChromeUserAgent = {
      platform: normalizePlatform(platform),
      version: normalizeVersion(version),
      userAgent,
    };
    return userAgent;
  };

  if (options.chromeUserAgent) {
    await page.SetChromeUserAgent(options.chromeUserAgent.platform, options.chromeUserAgent.version);
  }

  if (options.turnstile === true) {
    startTurnstileLoop(page, options.turnstileIntervalMs || 1000);
  }

  return page;
}

function normalizeLaunchOptions(options = {}) {
  const {
    turnstile = false,
    turnstileIntervalMs = 1000,
    chromeUserAgent,
    disableXvfb = false,
    args = [],
    ...rest
  } = options;

  if (chromeUserAgent) {
    normalizePlatform(chromeUserAgent.platform);
    normalizeVersion(chromeUserAgent.version);
  }

  return {
    launchOptions: {
      ...rest,
      args: buildFingerprintArgs(args, chromeUserAgent),
    },
    kittyOptions: {
      turnstile,
      turnstileIntervalMs,
      chromeUserAgent,
    },
    runtimeOptions: {
      headless: rest.headless,
      disableXvfb,
    },
  };
}

async function decorateBrowser(browser, kittyOptions) {
  const originalNewPage = browser.newPage.bind(browser);

  browser.newPage = async (...args) => {
    const page = await originalNewPage(...args);
    return decoratePage(page, kittyOptions);
  };

  const pages = await browser.pages();
  for (const page of pages) {
    await decoratePage(page, kittyOptions);
  }

  browser.on('targetcreated', async (target) => {
    if (target.type() !== 'page') {
      return;
    }

    try {
      const page = await target.page();
      if (page) {
        await decoratePage(page, kittyOptions);
      }
    } catch {
    }
  });

  return browser;
}

async function launch(options = {}) {
  const { launch: cloakLaunch } = await import('cloakbrowser/puppeteer');
  const { launchOptions, kittyOptions, runtimeOptions } = normalizeLaunchOptions(options);
  const xvfbSession = await startXvfbSessionIfNeeded(runtimeOptions);
  try {
    const browser = await cloakLaunch(launchOptions);
    attachXvfbLifecycle(browser, xvfbSession);
    return decorateBrowser(browser, kittyOptions);
  } catch (error) {
    if (xvfbSession) {
      try {
        xvfbSession.stopSync();
      } catch {
      }
    }
    throw error;
  }
}

async function launchPersistentContext(options = {}) {
  const { launchPersistentContext: cloakLaunchPersistentContext } = await import('cloakbrowser/puppeteer');
  const { launchOptions, kittyOptions, runtimeOptions } = normalizeLaunchOptions(options);
  const xvfbSession = await startXvfbSessionIfNeeded(runtimeOptions);
  try {
    const browser = await cloakLaunchPersistentContext(launchOptions);
    attachXvfbLifecycle(browser, xvfbSession);
    return decorateBrowser(browser, kittyOptions);
  } catch (error) {
    if (xvfbSession) {
      try {
        xvfbSession.stopSync();
      } catch {
      }
    }
    throw error;
  }
}

module.exports = {
  launch,
  launchPersistentContext,
  buildChromeUserAgent,
  constants: {
    MIN_CHROME_VERSION,
    MAX_CHROME_VERSION,
    SUPPORTED_PLATFORMS,
  },
};
