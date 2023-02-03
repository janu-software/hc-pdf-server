/**
 * @see https://github.com/puppeteer/puppeteer/blob/v5.3.1/docs/api.md#pagepdfoptions
 */

import { PDFMargin, PDFOptions } from 'puppeteer'

const zeroMargin: PDFMargin = {
  top: '0mm',
  bottom: '0mm',
  left: '0mm',
  right: '0mm',
}

export const PresetPDFOptions: { [key: string]: PDFOptions } = {
  A4Full: {
    format: 'a4',
    margin: zeroMargin,
    printBackground: true,
  },
  A4LandscapeFull: {
    format: 'a4',
    landscape: true,
    margin: zeroMargin,
    printBackground: true,
  },
}
