import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { chromium } from 'playwright-core';

function getChromeExecutablePathCandidates() {
  return [
    process.env.CHROME_PATH,
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ].filter(Boolean) as string[];
}

async function pathExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolvePlaywrightCacheChromium(): Promise<string> {
  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    path.join(os.homedir(), 'Library/Caches/ms-playwright'),
    path.join(os.homedir(), '.cache/ms-playwright'),
  ].filter(Boolean) as string[];

  const macCandidates = [
    'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
    'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    'chrome-linux/chrome',
  ];

  for (const root of roots) {
    let entries: string[] = [];
    try {
      entries = await fs.readdir(root);
    } catch {
      continue;
    }

    const chromiumDirs = entries.filter((entry) => entry.startsWith('chromium-')).sort().reverse();
    for (const dir of chromiumDirs) {
      for (const relative of macCandidates) {
        const candidate = path.join(root, dir, relative);
        if (await pathExists(candidate)) return candidate;
      }
    }
  }

  return '';
}

async function resolveChromiumExecutablePath(): Promise<string> {
  for (const candidate of getChromeExecutablePathCandidates()) {
    if (await pathExists(candidate)) return candidate;
  }

  return resolvePlaywrightCacheChromium();
}

function getKatexCssCandidates() {
  return [
    process.env.KATEX_CSS_PATH,
    path.join(process.cwd(), 'apps/web/node_modules/katex/dist/katex.min.css'),
    path.join(process.cwd(), 'node_modules/katex/dist/katex.min.css'),
  ].filter(Boolean) as string[];
}

export async function launchBubblePdfBrowser() {
  const executablePath = await resolveChromiumExecutablePath();
  if (!executablePath) {
    throw new Error('CHROMIUM_NOT_AVAILABLE');
  }

  return chromium.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
}

export async function readKatexCss(): Promise<string> {
  for (const candidate of getKatexCssCandidates()) {
    try {
      if (await pathExists(candidate)) {
        return await fs.readFile(candidate, 'utf8');
      }
    } catch {
      // Try the next candidate path.
    }
  }
  return '';
}
