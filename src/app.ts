import fastify, { FastifyInstance } from 'fastify'
import formBody from '@fastify/formbody'
import bearerAuthPlugin from '@fastify/bearer-auth'
import { LaunchOptions, Page, ScreenshotOptions } from 'puppeteer'
import { hcPages } from '@uyamazak/fastify-hc-pages'
import { hcPDFOptionsPlugin } from './plugins/pdf-options'
import { AppConfig, GetQuerystring, PostBody } from './types/hc-pdf-server'
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
  },
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

const buildBrowserLaunchArgs = (): LaunchOptions => {
  return {
    args: BROWSER_LAUNCH_ARGS.trim().split(','),
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
  const launchOptions = buildBrowserLaunchArgs()
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

    try {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      const buffer = await server.runOnPage<Uint8Array>(async (page: Page) => {
        await page.setContent(html, {
          waitUntil: ['domcontentloaded', 'networkidle0'],
        })
        return await page.pdf(pdfOptions)
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
          // wait for dynamic content to load
          await Promise.resolve(() => setTimeout(() => {}, 250))
          // Try to accept cookies
          await page.evaluate(() => {
            function xcc_contains(selector: string, text: string | RegExp) {
              const elements = document.querySelectorAll(selector)
              return Array.prototype.filter.call(elements, function (element) {
                return RegExp(text, 'i').test(element.textContent.trim())
              })
            }
            const _xcc = xcc_contains(
              '[id*=cookie] a, [class*=cookie] a, [id*=cookie] button, [class*=cookie] button, [data-cookiebanner*=accept] button',
              '^(Alle akzeptieren|Akzeptieren|Verstanden|Zustimmen|Okay|OK)$'
            )
            if (_xcc != null && _xcc.length !== 0) {
              _xcc[0].click()
            }
          })
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

          // wait for dynamic content to load
          await Promise.resolve(() => setTimeout(() => {}, 250))

          // Try to accept cookies
          await page.evaluate(() => {
            function xcc_contains(selector: string, text: string | RegExp) {
              const elements = document.querySelectorAll(selector)
              return Array.prototype.filter.call(elements, function (element) {
                return RegExp(text, 'i').test(element.textContent.trim())
              })
            }
            const _xcc = xcc_contains(
              '[id*=cookie] a, [class*=cookie] a, [id*=cookie] button, [class*=cookie] button, [data-cookiebanner*=accept] button',
              '^(Alle akzeptieren|Akzeptieren|Verstanden|Zustimmen|Okay|OK)$'
            )
            if (_xcc != null && _xcc.length !== 0) {
              _xcc[0].click()
            }
          })
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
