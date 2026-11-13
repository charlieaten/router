import path from 'node:path'
import { createRequire } from 'node:module'
import { createMetroTransformer } from '@tanstack/react-start/plugin/metro'

const require = createRequire(import.meta.url)
const { getDefaultConfig } = require('expo/metro-config')
const { babelTransformerPath } = getDefaultConfig(
  import.meta.dirname,
).transformer
const transformer = createMetroTransformer({
  root: path.resolve(import.meta.dirname, '..'),
  upstream: require(babelTransformerPath),
  mode: process.env.TANSTACK_START_MODE,
})
export const transform = transformer.transform
export const getCacheKey = transformer.getCacheKey
