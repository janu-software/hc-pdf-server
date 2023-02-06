import { Viewport } from 'puppeteer'

export interface GetQuerystring {
  url: string
  pdf_option?: string
  w?: string
  h?: string
}

export interface PostBody {
  html: string
  pdf_option?: string
  w?: string
  h?: string
}

export interface AppConfig {
  presetPdfOptionsFilePath: string
  defaultPresetPdfOptionsName: string
  bearerAuthSecretKey?: string
  pagesNum?: number
  userAgent?: string
  pageTimeoutMilliseconds?: number
  emulateMediaTypeScreenEnabled?: boolean
  acceptLanguage?: string
  fastifyLogLevel?: string
  fastifyBodyLimit?: number
  viewport?: Viewport
}
