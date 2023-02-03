/**
 * @see https://github.com/puppeteer/puppeteer/blob/v5.3.1/docs/api.md#pagepdfoptions
 */

import { PDFMargin, PDFOptions } from 'puppeteer'

import {
  DEFAULT_PDF_OPTION_FORMAT,
  DEFAULT_PDF_OPTION_LANDSCAPE,
  DEFAULT_PDF_OPTION_MARGIN,
  DEFAULT_PDF_OPTION_PRINT_BACKGROUND,
} from '../../config'

const defaultMargin: PDFMargin = {
  top: DEFAULT_PDF_OPTION_MARGIN,
  bottom: DEFAULT_PDF_OPTION_MARGIN,
  left: DEFAULT_PDF_OPTION_MARGIN,
  right: DEFAULT_PDF_OPTION_MARGIN,
}

const zeroMargin: PDFMargin = {
  top: '0mm',
  bottom: '0mm',
  left: '0mm',
  right: '0mm',
}

export const PresetPDFOptions: { [key: string]: PDFOptions } = {
  DEFAULT: {
    format: DEFAULT_PDF_OPTION_FORMAT,
    landscape: DEFAULT_PDF_OPTION_LANDSCAPE,
    margin: defaultMargin,
    printBackground: DEFAULT_PDF_OPTION_PRINT_BACKGROUND,
    preferCSSPageSize: true,
  },
  A4: {
    format: 'a4',
    margin: defaultMargin,
    printBackground: true,
    preferCSSPageSize: true,
  },
  A3: {
    format: 'a3',
    margin: defaultMargin,
    printBackground: true,
    preferCSSPageSize: true,
  },
  A4L: {
    format: 'a4',
    landscape: true,
    margin: defaultMargin,
    printBackground: true,
    preferCSSPageSize: true,
  },
  A3L: {
    format: 'a3',
    landscape: true,
    margin: defaultMargin,
    printBackground: true,
    preferCSSPageSize: true,
  },
  A4Full: {
    format: 'a4',
    margin: zeroMargin,
    printBackground: true,
    preferCSSPageSize: true,
  },
  A4LandscapeFull: {
    format: 'a4',
    landscape: true,
    margin: zeroMargin,
    printBackground: true,
    preferCSSPageSize: true,
  },
}
