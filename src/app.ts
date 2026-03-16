import fastify, { FastifyInstance } from 'fastify'
import formBody from '@fastify/formbody'
import bearerAuthPlugin from '@fastify/bearer-auth'
import { LaunchOptions, Page, ScreenshotOptions } from 'puppeteer'
import { hcPages } from '@uyamazak/fastify-hc-pages'
import { hcPDFOptionsPlugin } from './plugins/pdf-options'
import { AppConfig, GetQuerystring, PostBody } from './types/hc-pdf-server'
import { anonymizeProxy } from 'proxy-chain'
import {
  ACCEPT_LANGUAGE,
  BEARER_AUTH_SECRET_KEY,
  BROWSER_LAUNCH_ARGS,
  DEFAULT_PRESET_PDF_OPTIONS_NAME,
  DEFAULT_VIEWPORT,
  EMULATE_MEDIA_TYPE_SCREEN_ENABLED,
  FASTIFY_BODY_LIMIT,
  FASTIFY_LOG_LEVEL,
  PAGE_TIMEOUT_MILLISECONDS,
  PAGES_NUM,
  PRESET_PDF_OPTIONS_FILE_PATH,
  USER_AGENT,
} from './config'

const getSchema = {
  querystring: {
    url: { type: 'string' },
    pdf_option: { type: ['null', 'string'] },
  },
}

const postSchema = {
  body: {
    html: { type: 'string' },
    pdf_option: { type: ['null', 'string'] },
    wait_for_ready: { type: ['null', 'boolean', 'string'] },
    ready_selector: { type: ['null', 'string'] },
    base_url: { type: ['null', 'string'] },
  },
}

const DEFAULT_READY_SELECTOR = 'html[data-pdf-ready="true"]'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Comprehensive cookie consent dismissal for screenshots.
 * Uses a multi-layer approach:
 * 1. CSS injection to immediately hide known consent elements + overlays
 * 2. Click accept buttons from known CMP frameworks
 * 3. Generic multilingual text-based button clicking
 * 4. DOM cleanup + scroll lock fix
 */
const dismissCookieConsent = async (page: Page): Promise<void> => {
  // Layer 1: CSS injection — immediately hides known consent elements and overlays
  await page.evaluate(() => {
    const style = document.createElement('style')
    style.id = '__cookie_consent_killer'
    style.textContent = `
      /* Known CMP frameworks */
      #CybotCookiebotDialog,
      #CybotCookiebotDialogBodyUnderlay,
      #onetrust-consent-sdk,
      .onetrust-pc-dark-filter,
      #onetrust-banner-sdk,
      .qc-cmp2-container,
      .qc-cmp2-background,
      #cookie-law-info-bar,
      .cky-consent-container,
      .cky-overlay,
      .klaro,
      .klaro .cookie-modal,
      .osano-cm-window,
      .osano-cm-dialog__backdrop,
      #cmplz-cookiebanner-container,
      .cmplz-overlay,
      #cookie-notice,
      #didomi-popup,
      #didomi-notice,
      #didomi-notice-backdrop,
      .didomi-popup-backdrop,
      #truste-consent-track,
      .trustarc-banner-overlay,
      #usercentrics-root,
      .iubenda-cs-banner,
      #iubenda-cs-banner,
      .iubenda-cs-overlay,
      #hs-eu-cookie-confirmation,
      #moove_gdpr_cookie_info_bar,
      .moove-gdpr-dark-bg,
      .cc-window,
      .cc-banner,
      .cc-overlay,
      .cc-revoke,
      .fc-consent-root,
      .fc-dialog-overlay,
      #fc-dialog-container,
      .sp-message-container,
      #sp-cc,
      .evidon-banner,
      #evidon-barrier-wrapper,
      .cookiefirst-root,
      #cookiescript_injected,
      #cookiescript_injected_fsd,
      .termly-consent-banner,
      #termly-code-snippet-support,
      .hu-cookies-container,

      /* Shadow DOM host elements (custom elements) */
      tiktok-cookie-banner,
      usercentrics-cmp,

      /* Generic patterns */
      .gdpr-banner,
      .cookie-banner,
      .cookie-consent,
      .cookie-popup,
      .cookie-overlay,
      .cookie-modal,
      .cookie-wall,
      .cookie-bar,
      .cookie-dialog,
      .consent-banner,
      .consent-overlay,
      .consent-modal,
      .consent-popup,
      .consent-dialog,
      .consent-wall,
      .privacy-banner,
      .privacy-popup,
      [class*="cookie-consent"],
      [class*="cookie-banner"],
      [class*="cookie-notice"],
      [class*="cookie-popup"],
      [class*="cookie-wall"],
      [class*="cookie-overlay"],
      [class*="CookieConsent"],
      [class*="CookieBanner"],
      [class*="cookieConsent"],
      [class*="cookieBanner"],
      [class*="consent-banner"],
      [class*="consent-popup"],
      [class*="consent-modal"],
      [class*="gdpr-banner"],
      [class*="gdpr-popup"],
      [id*="cookie-consent"],
      [id*="cookie-banner"],
      [id*="cookie-notice"],
      [id*="cookie-popup"],
      [id*="cookieconsent"],
      [id*="cookiebanner"],
      [id*="gdpr"],
      [aria-label*="cookie" i],
      [aria-label*="consent" i],
      [aria-label*="cookie consent" i],
      [role="dialog"][class*="cookie" i],
      [role="dialog"][class*="consent" i],
      [role="banner"][class*="cookie" i],
      [data-testid*="cookie" i],
      [data-testid*="consent" i],
      [data-cookiebanner],
      [data-cookie-banner],
      [data-cookie-consent] {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
        height: 0 !important;
        max-height: 0 !important;
        overflow: hidden !important;
        position: absolute !important;
        z-index: -9999 !important;
      }

      /* Fix body/html scroll lock that consent managers often apply */
      body, html {
        overflow: auto !important;
        position: static !important;
        height: auto !important;
      }
      body.modal-open,
      body.no-scroll,
      body.cookie-open,
      body.has-banner,
      body[style*="overflow: hidden"],
      html[style*="overflow: hidden"] {
        overflow: auto !important;
      }
    `
    document.head.appendChild(style)
  })

  // Layer 2: Click accept buttons from known CMP frameworks
  const knownAcceptSelectors = [
    // CookieBot
    '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
    '#CybotCookiebotDialogBodyButtonAccept',
    'button#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
    // OneTrust
    '#onetrust-accept-btn-handler',
    '.onetrust-close-btn-handler',
    // Quantcast
    '.qc-cmp2-summary-buttons button[mode="primary"]',
    '[data-testid="GDPR-CTA_primary"]',
    // CookieYes
    '.cky-btn-accept',
    '#cookie_action_close_header',
    // Klaro
    '.klaro .cm-btn-accept-all',
    '.klaro .cm-btn-accept',
    '.klaro button[class*="accept"]',
    // Osano
    '.osano-cm-accept-all',
    '.osano-cm-accept',
    // Complianz
    '.cmplz-accept',
    '#cmplz-btn',
    '.cmplz-btn.cmplz-accept',
    // Cookie Notice
    '.cn-accept-cookie',
    '#cn-accept-cookie',
    // Didomi
    '#didomi-notice-agree-button',
    '.didomi-continue-without-agreeing',
    // TrustArc
    '#truste-consent-button',
    '.trustarc-agree-btn',
    // Iubenda
    '.iubenda-cs-accept-btn',
    '#iubenda-cs-banner .iubenda-cs-accept-btn',
    // HubSpot
    '#hs-eu-confirmation-button',
    // Moove GDPR
    '.moove-gdpr-infobar-allow-all',
    // Cookie Consent (Insites/cookieconsent)
    '.cc-accept-all',
    '.cc-allow',
    '.cc-dismiss',
    '.cc-btn.cc-dismiss',
    // Funding Choices (Google)
    '.fc-cta-consent',
    '.fc-primary-button',
    // Sourcepoint
    'button[title="Accept"]',
    'button[title="Accept all"]',
    // Evidon
    '#evidon-banner-acceptbutton',
    // CookieFirst
    'button[data-cookiefirst-action="accept"]',
    // CookieScript
    '#cookiescript_accept',
    // Termly
    'button[class*="termly-accept"]',
    'a[class*="t-accept-all"]',
  ]

  for (const selector of knownAcceptSelectors) {
    try {
      const element = await page.$(selector)
      if (element) {
        await element.click()
        break
      }
    } catch {
      // Ignore, try next selector
    }
  }

  // Layer 2b: Shadow DOM piercing for custom element consent banners (TikTok, Usercentrics, etc.)
  await page.evaluate(() => {
    const shadowHostSelectors = [
      'tiktok-cookie-banner',
      'usercentrics-cmp',
      '#usercentrics-root',
    ]

    // Multilingual accept button text patterns for shadow DOM buttons
    const acceptPattern =
      /^(Povolit vše|Povolit všechny|Přijmout vše|Přijmout všechny|Souhlasím|Accept all|Accept|Allow all|Allow|Alle akzeptieren|Akzeptieren|Tout accepter|Accepter tout|Aceptar todo|Accetta tutto|Zaakceptuj wszystkie|Alles accepteren|Aceitar tudo|Prijať všetky|OK|Okay)$/i

    for (const selector of shadowHostSelectors) {
      try {
        const host = document.querySelector(selector)
        if (!host) continue

        const shadow = host.shadowRoot
        if (shadow) {
          // Try to find and click accept button inside shadow DOM
          const buttons = shadow.querySelectorAll('button, a[role="button"]')
          for (const btn of Array.from(buttons)) {
            const text = btn.textContent?.trim() ?? ''
            if (acceptPattern.test(text)) {
              ;(btn as HTMLElement).click()
              break
            }
          }
        }

        // Remove the host element entirely to clean up
        host.remove()
      } catch {
        // Continue to next
      }
    }
  })

  // Layer 3: Generic multilingual text-based button matching
  await page.evaluate(() => {
    const consentButtonTexts = [
      // Czech
      'Přijmout vše',
      'Přijmout všechny',
      'Přijmout',
      'Souhlasím',
      'Souhlasím se vším',
      'Povolit vše',
      'Povolit všechny',
      'Povolit',
      'Přijmout cookies',
      'Rozumím',
      'Akceptovat',
      // English
      'Accept all',
      'Accept all cookies',
      'Accept cookies',
      'Accept',
      'Allow all',
      'Allow all cookies',
      'Allow cookies',
      'Allow',
      'Agree',
      'Agree to all',
      'I agree',
      'Got it',
      'I understand',
      'Continue',
      'Close',
      'Consent',
      'Yes, I agree',
      // German
      'Alle akzeptieren',
      'Akzeptieren',
      'Alle Cookies akzeptieren',
      'Verstanden',
      'Zustimmen',
      'Allen zustimmen',
      'Alles akzeptieren',
      'Einverstanden',
      'Alle erlauben',
      // French
      'Accepter tout',
      'Tout accepter',
      'Accepter',
      "J'accepte",
      'Autoriser tout',
      'Continuer',
      'Tout autoriser',
      // Spanish
      'Aceptar todo',
      'Aceptar todas',
      'Aceptar',
      'Aceptar cookies',
      'Permitir todo',
      'Estoy de acuerdo',
      // Italian
      'Accetta tutto',
      'Accetta tutti',
      'Accetta',
      'Accetto',
      'Accetta i cookie',
      'Ho capito',
      // Polish
      'Zaakceptuj wszystkie',
      'Akceptuję',
      'Akceptuj',
      'Akceptuj wszystkie',
      'Zgadzam się',
      'Zgoda',
      'Akceptuję wszystkie',
      // Dutch
      'Alles accepteren',
      'Accepteren',
      'Alle cookies accepteren',
      'Akkoord',
      'Ik ga akkoord',
      'Alles toestaan',
      // Portuguese
      'Aceitar tudo',
      'Aceitar todos',
      'Aceitar',
      'Aceito',
      'Aceitar cookies',
      // Slovak
      'Prijať všetky',
      'Prijať všetko',
      'Súhlasím',
      'Povoliť všetky',
      // Generic
      'OK',
      'Okay',
    ]

    const consentTextPattern = new RegExp(
      '^(' +
        consentButtonTexts
          .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('|') +
        ')$',
      'i'
    )

    // Search in common consent element containers first, then fall back to all buttons/links
    const selectors = [
      // Specific consent containers
      '[id*=cookie] button',
      '[id*=cookie] a',
      '[class*=cookie] button',
      '[class*=cookie] a',
      '[id*=consent] button',
      '[id*=consent] a',
      '[class*=consent] button',
      '[class*=consent] a',
      '[id*=gdpr] button',
      '[id*=gdpr] a',
      '[class*=gdpr] button',
      '[class*=gdpr] a',
      '[id*=privacy] button',
      '[id*=privacy] a',
      '[class*=privacy] button',
      '[class*=privacy] a',
      '[data-cookiebanner] button',
      '[data-cookiebanner] a',
      '[data-cookie-banner] button',
      '[data-cookie-banner] a',
      '[role="dialog"] button',
      '[role="alertdialog"] button',
      // Broader search for fixed/sticky positioned elements (likely banners)
      'div[style*="position: fixed"] button',
      'div[style*="position:fixed"] button',
      'div[style*="z-index"] button',
    ]

    for (const selector of selectors) {
      try {
        const elements = document.querySelectorAll(selector)
        for (const el of Array.from(elements)) {
          const text = (el as HTMLElement).textContent?.trim() ?? ''
          if (consentTextPattern.test(text)) {
            ;(el as HTMLElement).click()
            return
          }
        }
      } catch {
        // Continue to next selector
      }
    }
  })

  // Layer 4: DOM cleanup — remove remaining consent elements and fix scroll lock
  await page.evaluate(() => {
    const removeSelectors = [
      '#CybotCookiebotDialog',
      '#CybotCookiebotDialogBodyUnderlay',
      '#onetrust-consent-sdk',
      '.onetrust-pc-dark-filter',
      '.qc-cmp2-container',
      '.qc-cmp2-background',
      '#cookie-law-info-bar',
      '.cky-consent-container',
      '.cky-overlay',
      '.klaro',
      '#cmplz-cookiebanner-container',
      '.cmplz-overlay',
      '#didomi-popup',
      '#didomi-notice',
      '.didomi-popup-backdrop',
      '#didomi-notice-backdrop',
      '#truste-consent-track',
      '.trustarc-banner-overlay',
      '.iubenda-cs-banner',
      '.iubenda-cs-overlay',
      '#hs-eu-cookie-confirmation',
      '#moove_gdpr_cookie_info_bar',
      '.moove-gdpr-dark-bg',
      '.cc-window',
      '.cc-banner',
      '.cc-overlay',
      '.fc-consent-root',
      '.fc-dialog-overlay',
      '#fc-dialog-container',
      '.sp-message-container',
      '#sp-cc',
      '#evidon-barrier-wrapper',
      '.evidon-banner',
      '#cookiescript_injected',
      '#cookiescript_injected_fsd',
      '.termly-consent-banner',
      // Shadow DOM custom elements
      'tiktok-cookie-banner',
      '#tiktok-cookie-banner-config',
      'usercentrics-cmp',
    ]
    for (const selector of removeSelectors) {
      document.querySelectorAll(selector).forEach((el) => el.remove())
    }

    // Remove generic overlay/backdrop elements related to consent
    document
      .querySelectorAll(
        '[class*="overlay"], [class*="backdrop"], [class*="modal-bg"]'
      )
      .forEach((el) => {
        const cls = el.className.toString().toLowerCase()
        if (
          cls.includes('cookie') ||
          cls.includes('consent') ||
          cls.includes('gdpr') ||
          cls.includes('privacy')
        ) {
          el.remove()
        }
      })

    // Fix scroll lock
    document.body.style.overflow = ''
    document.body.style.position = ''
    document.documentElement.style.overflow = ''
    document.body.classList.remove(
      'modal-open',
      'no-scroll',
      'cookie-open',
      'has-banner',
      'noscroll',
      'overflow-hidden'
    )
  })
}

const isWaitForReadyEnabled = (value: unknown): boolean => {
  if (value === true) {
    return true
  }

  if (typeof value !== 'string') {
    return false
  }

  const normalized = value.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes'
}

const injectBaseUrl = (html: string, baseUrl?: string | null): string => {
  if (!baseUrl || baseUrl.trim() === '' || /<base\s/i.test(html)) {
    return html
  }

  const baseTag = `<base href="${baseUrl.trim()}">`

  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`)
  }

  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html([^>]*)>/i, `<html$1><head>${baseTag}</head>`)
  }

  return `<head>${baseTag}</head>${html}`
}

const waitForPageAssets = async (
  page: Page,
  timeout: number,
  logger: FastifyInstance['log']
) => {
  logger.debug({ timeout }, 'POST / waiting for HTML assets and fonts')

  await page.waitForFunction(
    () => {
      const imagesReady = Array.from(document.images).every(
        (image) => image.complete
      )
      const fonts = (
        document as Document & {
          fonts?: {
            status?: string
            ready?: Promise<unknown>
          }
        }
      ).fonts
      const fontsReady = !fonts || fonts.status === 'loaded'

      return imagesReady && fontsReady
    },
    {
      timeout,
    }
  )

  await page.evaluate(async () => {
    const fonts = (
      document as Document & {
        fonts?: {
          ready?: Promise<unknown>
        }
      }
    ).fonts

    if (fonts?.ready) {
      await fonts.ready
    }
  })
}

const createPDFHttpHeader = (buffer: Uint8Array) => ({
  'Content-Type': 'application/pdf',
  'Content-Length': buffer.length,
  // prevent cache
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  Pragma: 'no-cache',
  Expires: 0,
})

const createScreenshotHttpHeader = (buffer: string | Uint8Array) => ({
  'Content-Type': 'image/png',
  'Content-Length': buffer.length,
  // prevent cache
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  Pragma: 'no-cache',
  Expires: 0,
})

const defaultAppConfig: AppConfig = {
  presetPdfOptionsFilePath: PRESET_PDF_OPTIONS_FILE_PATH,
  defaultPresetPdfOptionsName: DEFAULT_PRESET_PDF_OPTIONS_NAME,
  bearerAuthSecretKey: BEARER_AUTH_SECRET_KEY,
  pagesNum: PAGES_NUM,
  userAgent: USER_AGENT,
  pageTimeoutMilliseconds: PAGE_TIMEOUT_MILLISECONDS,
  emulateMediaTypeScreenEnabled: EMULATE_MEDIA_TYPE_SCREEN_ENABLED,
  acceptLanguage: ACCEPT_LANGUAGE,
  fastifyLogLevel: FASTIFY_LOG_LEVEL,
  fastifyBodyLimit: FASTIFY_BODY_LIMIT,
  viewport: DEFAULT_VIEWPORT,
}

const buildBrowserLaunchArgs = async (): Promise<LaunchOptions> => {
  const args = BROWSER_LAUNCH_ARGS.trim().split(';')
  const upstreamProxy = 'http://mhiaebta-rotate:twqlubqx2pvs@p.webshare.io:80'

  const localProxy = await anonymizeProxy(upstreamProxy)
  args.push(`--proxy-server=${localProxy}`)
  args.push('--proxy-bypass-list=<-loopback>,gas-online.cz,*.gas-online.cz')
  return {
    args,
  }
}

export const app = async (
  appConfig = {} as Partial<AppConfig>
): Promise<FastifyInstance> => {
  const {
    presetPdfOptionsFilePath,
    defaultPresetPdfOptionsName,
    bearerAuthSecretKey,
    pagesNum,
    userAgent,
    pageTimeoutMilliseconds,
    emulateMediaTypeScreenEnabled,
    acceptLanguage,
    fastifyLogLevel,
    fastifyBodyLimit,
    viewport,
  } = { ...defaultAppConfig, ...appConfig }
  const pageOperationTimeout = pageTimeoutMilliseconds ?? 30000

  const server = fastify({
    logger: { level: fastifyLogLevel },
    bodyLimit: fastifyBodyLimit,
  })
  server.register(hcPDFOptionsPlugin, {
    filePath: presetPdfOptionsFilePath,
  })
  server.register(formBody)
  const pageOptions = {
    userAgent,
    pageTimeoutMilliseconds,
    emulateMediaTypeScreenEnabled,
    acceptLanguage,
    viewport,
  }
  console.debug('pageOptions:', pageOptions)
  const launchOptions = await buildBrowserLaunchArgs()
  console.debug('launchOptions:', launchOptions)
  server.register(hcPages, {
    pagesNum,
    pageOptions,
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    launchOptions,
  })

  if (bearerAuthSecretKey) {
    const keys = new Set([bearerAuthSecretKey])
    server.register(bearerAuthPlugin, { keys })
  }

  server.get<{
    Querystring: GetQuerystring
  }>('/hc', { schema: getSchema }, async (request, reply) => {
    reply.header('X-Version', process.env.npm_package_version || 'unknown')
    reply.send('ok')
  })

  server.get<{
    Querystring: GetQuerystring
  }>('/', { schema: getSchema }, async (request, reply) => {
    const { url } = request.query
    if (!url) {
      reply.code(400).send({ error: 'url is required' })
      return
    }

    const pdfOptionsQuery =
      request.query.pdf_option ?? defaultPresetPdfOptionsName
    try {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      const buffer = await server.runOnPage<Uint8Array>(async (page: Page) => {
        // forward cookies from request to target page
        const cookies = request.headers.cookie
        if (cookies) {
          const cookieArray = cookies.split(';').map((cookie) => {
            const [name, ...rest] = cookie.trim().split('=')
            const value = rest.join('=')
            return { name, value, url }
          })
          console.log('cookies', cookies)
          await page.setCookie(...cookieArray)
        }
        console.log(`Navigating to URL: ${url}`)
        await page.goto(url, {
          waitUntil: 'networkidle0',
        })
        if (request.query.wait_for_ready) {
          await page.waitForSelector('html[data-pdf-ready="true"]', {
            timeout: 30000,
          })
        }
        const pdfOptions = server.getPDFOptions(pdfOptionsQuery)
        return await page.pdf(pdfOptions)
      })
      reply.headers(createPDFHttpHeader(buffer))
      reply.send(buffer)
    } catch (error) {
      console.error(`error ${error}`)
      reply.code(500).send({ error, url })
      return
    }
  })

  server.post<{
    Body: PostBody
  }>('/', { schema: postSchema }, async (request, reply) => {
    const body = request.body ?? null
    if (!body) {
      reply.code(400).send({ error: 'request body is empty' })
      return
    }
    const html = body.html ?? ''
    if (!html) {
      reply.code(400).send({ error: 'html is required' })
      return
    }
    const pdfOptionsQuery = body.pdf_option ?? defaultPresetPdfOptionsName
    const pdfOptions = server.getPDFOptions(pdfOptionsQuery)
    const waitForReady = isWaitForReadyEnabled(body.wait_for_ready)
    const readySelector = body.ready_selector?.trim() || DEFAULT_READY_SELECTOR
    const htmlWithBaseUrl = injectBaseUrl(html, body.base_url)

    try {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      const buffer = await server.runOnPage<Uint8Array>(async (page: Page) => {
        const renderStartedAt = Date.now()

        request.log.info(
          {
            htmlLength: html.length,
            htmlWithBaseUrlLength: htmlWithBaseUrl.length,
            pdfOption: pdfOptionsQuery,
            waitForReady,
            readySelector: waitForReady ? readySelector : null,
            baseUrl: body.base_url ?? null,
          },
          'POST / PDF render started'
        )

        await page.setContent(htmlWithBaseUrl, {
          waitUntil: 'domcontentloaded',
        })
        request.log.info(
          {
            elapsedMs: Date.now() - renderStartedAt,
          },
          'POST / page.setContent finished'
        )

        if (waitForReady) {
          request.log.info(
            {
              readySelector,
            },
            'POST / waiting for ready selector'
          )
          await page.waitForSelector(readySelector, {
            timeout: pageOperationTimeout,
          })
          request.log.info(
            {
              elapsedMs: Date.now() - renderStartedAt,
              readySelector,
            },
            'POST / ready selector resolved'
          )
        }

        await waitForPageAssets(page, pageOperationTimeout, request.log)
        request.log.info(
          {
            elapsedMs: Date.now() - renderStartedAt,
          },
          'POST / page assets ready'
        )

        await sleep(250)

        request.log.info(
          {
            elapsedMs: Date.now() - renderStartedAt,
            pdfOption: pdfOptionsQuery,
          },
          'POST / page.pdf started'
        )
        const pdfBuffer = await page.pdf(pdfOptions)
        request.log.info(
          {
            elapsedMs: Date.now() - renderStartedAt,
            pdfBytes: pdfBuffer.length,
          },
          'POST / page.pdf finished'
        )

        return pdfBuffer
      })
      reply.headers(createPDFHttpHeader(buffer))
      reply.send(buffer)
    } catch (error) {
      console.error(`error ${error}`)
      reply.code(500).send({ error })
      return
    }
  })

  server.get('/pdf_options', (_, reply) => {
    reply.send(server.getPresetPDFOptions())
  })

  server.get<{
    Querystring: GetQuerystring
  }>('/screenshot', { schema: getSchema }, async (request, reply) => {
    const { url, w, h } = request.query
    if (!url) {
      reply.code(400).send({ error: 'url is required' })
      return
    }

    const screenshotOptions: ScreenshotOptions = {}
    if (w && h) {
      screenshotOptions.clip = {
        x: 0,
        y: 0,
        width: parseInt(w),
        height: parseInt(h),
      }
      screenshotOptions.captureBeyondViewport = false
    } else {
      screenshotOptions.fullPage = true
    }
    try {
      const buffer = await server.runOnPage<string | Uint8Array>(
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        async (page: Page) => {
          if (w && h) {
            await page.setViewport({
              width: parseInt(w),
              height: parseInt(h),
            })
          }
          await page.goto(url, {
            waitUntil: ['domcontentloaded', 'networkidle0'],
          })
          await sleep(250)
          await dismissCookieConsent(page)
          await sleep(300)
          return await page.screenshot(screenshotOptions)
        }
      )
      reply.headers(createScreenshotHttpHeader(buffer))
      reply.send(buffer)
    } catch (error) {
      console.error(`error ${error}`)
      reply.code(500).send({ error, url })
      return
    }
  })

  server.post<{
    Body: PostBody
  }>('/screenshot', { schema: getSchema }, async (request, reply) => {
    const body = request.body ?? null
    if (!body) {
      reply.code(400).send({ error: 'request body is empty' })
      return
    }
    const html = body.html ?? ''
    const w = body.w ?? null
    const h = body.h ?? null
    if (!html) {
      reply.code(400).send({ error: 'html is required' })
      return
    }

    const screenshotOptions: ScreenshotOptions = {}
    if (w && h) {
      screenshotOptions.clip = {
        x: 0,
        y: 0,
        width: parseInt(w),
        height: parseInt(h),
      }
      screenshotOptions.captureBeyondViewport = false
    } else {
      screenshotOptions.fullPage = true
    }
    try {
      const buffer = await server.runOnPage<string | Uint8Array>(
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        async (page: Page) => {
          if (w && h) {
            await page.setViewport({
              width: parseInt(w),
              height: parseInt(h),
            })
          }
          await page.setContent(html, {
            waitUntil: ['domcontentloaded', 'networkidle0'],
          })
          await sleep(250)
          await dismissCookieConsent(page)
          await sleep(300)
          return await page.screenshot(screenshotOptions)
        }
      )
      reply.headers(createScreenshotHttpHeader(buffer))
      reply.send(buffer)
    } catch (error) {
      console.error(`error ${error}`)
      reply.code(500).send({ error, html })
      return
    }
  })

  return server
}
