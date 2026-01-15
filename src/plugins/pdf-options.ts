import { PDFOptions } from 'puppeteer'
import { FastifyInstance, FastifyPluginCallback } from 'fastify'
import fp from 'fastify-plugin'
import {
  PresetPDFOptions,
  PresetPDFOptionsLoaderConfig,
  PresetPDFOptionsModule,
} from '../types/pdf-options'
import { FastifyPluginOptions } from 'fastify/types/plugin'

export class PresetPDFOptionsLoader {
  preset: PresetPDFOptions
  defaultPDFOptions = {} as PDFOptions

  constructor(preset: PresetPDFOptions) {
    this.preset = preset
  }

  static async init(
    config: FastifyPluginOptions
  ): Promise<PresetPDFOptionsLoader> {
    const preset = await this.loadPDFOptionsPreset(config.filePath)
    if (!config.filePath) {
      throw new Error('filePath is required')
    }
    return new PresetPDFOptionsLoader(preset)
  }

  static async loadPDFOptionsPreset(
    filePath: string
  ): Promise<PresetPDFOptions> {
    const preset = (await import(filePath)) as PresetPDFOptionsModule
    return preset.PresetPDFOptions
  }

  get(name?: string): PDFOptions {
    if (!name) {
      return this.defaultPDFOptions
    }
    if (!(name in this.preset)) {
      console.error(`PDFOptions not found ${name}, use default.`)
      return this.defaultPDFOptions
    }
    return this.preset[name]
  }
}

const plugin: FastifyPluginCallback = async (
  instance: FastifyInstance,
  opts: FastifyPluginOptions
) => {
  const presetPDFOptionsLoader = await PresetPDFOptionsLoader.init(opts)
  instance.decorate('getPDFOptions', (name?: string) => {
    return presetPDFOptionsLoader.get(name)
  })
  instance.decorate('getPresetPDFOptions', () => {
    return presetPDFOptionsLoader.preset
  })
}

export const hcPDFOptionsPlugin = fp<PresetPDFOptionsLoaderConfig>(plugin, {
  fastify: '^4.0.0',
  name: 'hc-pdf-options-plugin',
})

declare module 'fastify' {
  interface FastifyInstance {
    getPDFOptions(name?: string): PDFOptions
    getPresetPDFOptions(): PresetPDFOptions
  }
}
