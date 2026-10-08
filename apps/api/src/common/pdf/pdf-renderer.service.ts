import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer, { type Browser } from 'puppeteer';

/** Same path from src/common/pdf and dist/common/pdf → apps/api/assets/fonts */
const FONT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../assets/fonts');

function fontFace(weight: number, file: string): string {
  const data = readFileSync(resolve(FONT_DIR, file)).toString('base64');
  return `@font-face{font-family:'Sarabun';font-weight:${weight};font-style:normal;src:url(data:font/ttf;base64,${data}) format('truetype');}`;
}

/**
 * Renders HTML to A4 PDF with headless Chromium. One browser is shared and launched lazily;
 * each render uses its own page. Sarabun is embedded so Thai shaping does not depend on host fonts.
 */
@Injectable()
export class PdfRendererService implements OnModuleDestroy {
  private readonly logger = new Logger(PdfRendererService.name);
  private browser: Promise<Browser> | null = null;
  private fontCss: string | null = null;

  constructor(private readonly config: ConfigService) {}

  /** `@font-face` rules for Sarabun 400/600/700 as data URIs — include inside the document's <style>. */
  get sarabunFontCss(): string {
    this.fontCss ??= [
      fontFace(400, 'Sarabun-Regular.ttf'),
      fontFace(600, 'Sarabun-SemiBold.ttf'),
      fontFace(700, 'Sarabun-Bold.ttf'),
    ].join('');
    return this.fontCss;
  }

  private getBrowser(): Promise<Browser> {
    if (!this.browser) {
      const executablePath = this.config.get<string>('PUPPETEER_EXECUTABLE_PATH') || undefined;
      this.browser = puppeteer
        .launch({
          // Bundled chrome-headless-shell locally; a system Chromium (Docker) only supports new headless
          headless: executablePath ? true : 'shell',
          executablePath,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
        })
        .then((b) => {
          b.on('disconnected', () => { this.browser = null; });
          return b;
        })
        .catch((err: unknown) => {
          this.browser = null;
          throw err;
        });
    }
    return this.browser;
  }

  async render(html: string, opts: { footerTemplate?: string } = {}): Promise<Buffer> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      // No network: everything (fonts, logo) is inlined, and JS is not needed.
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        if (req.url().startsWith('data:')) void req.continue();
        else void req.abort();
      });
      await page.setContent(html, { waitUntil: 'load' });
      await page.evaluateHandle('document.fonts.ready');
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '14mm', bottom: '16mm', left: '14mm', right: '14mm' },
        displayHeaderFooter: !!opts.footerTemplate,
        headerTemplate: '<span></span>',
        footerTemplate: opts.footerTemplate ?? '<span></span>',
      });
      return Buffer.from(pdf);
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  async onModuleDestroy() {
    if (!this.browser) return;
    try {
      await (await this.browser).close();
    } catch (err) {
      this.logger.warn(`Failed to close PDF browser: ${String(err)}`);
    }
  }
}
