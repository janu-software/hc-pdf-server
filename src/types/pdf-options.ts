import { PDFOptions } from 'puppeteer'

export interface PresetPDFOptions {
  [key: string]: PDFOptions
}
export interface PresetPDFOptionsModule {
  PresetPDFOptions: PresetPDFOptions
}
