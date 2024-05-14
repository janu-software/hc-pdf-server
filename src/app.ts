import fastify, { FastifyInstance } from 'fastify'
import formBody from '@fastify/formbody'
import bearerAuthPlugin from '@fastify/bearer-auth'
import {
  BrowserLaunchArgumentOptions,
  Page,
  ScreenshotOptions,
} from 'puppeteer'
import { hcPages } from '@uyamazak/fastify-hc-pages'
import { hcPDFOptionsPlugin } from './plugins/pdf-options'
import { AppConfig, GetQuerystring, PostBody } from './types/hc-pdf-server'
import {
  DEFAULT_PRESET_PDF_OPTIONS_NAME,
  BEARER_AUTH_SECRET_KEY,
  PAGES_NUM,
  USER_AGENT,
  PAGE_TIMEOUT_MILLISECONDS,
  PRESET_PDF_OPTIONS_FILE_PATH,
  EMULATE_MEDIA_TYPE_SCREEN_ENABLED,
  ACCEPT_LANGUAGE,
  FASTIFY_LOG_LEVEL,
  FASTIFY_BODY_LIMIT,
  DEFAULT_VIEWPORT,
  BROWSER_LAUNCH_ARGS,
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

const createPDFHttpHeader = (buffer: Buffer) => ({
  'Content-Type': 'application/pdf',
  'Content-Length': buffer.length,
  // prevent cache
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  Pragma: 'no-cache',
  Expires: 0,
})

const createScreenshotHttpHeader = (buffer: string | Buffer) => ({
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

const buildBrowserLaunchArgs = (): BrowserLaunchArgumentOptions => {
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
    launchOptions,
  })

  if (bearerAuthSecretKey) {
    const keys = new Set([bearerAuthSecretKey])
    server.register(bearerAuthPlugin, { keys })
  }

  server.get<{
    Querystring: GetQuerystring
  }>('/hc', { schema: getSchema }, async (request, reply) => {
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
      const buffer = await server.runOnPage<Buffer>(async (page: Page) => {
        await page.goto(url, {
          waitUntil: 'networkidle0',
        })
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
      const buffer = await server.runOnPage<Buffer>(async (page: Page) => {
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
      const buffer = await server.runOnPage<string | Buffer>(
        async (page: Page) => {
          if (w && h) {
            await page.setViewport({
              width: parseInt(w),
              height: parseInt(h),
            })
          }
          await page.goto(url)
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
      const buffer = await server.runOnPage<string | Buffer>(
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
