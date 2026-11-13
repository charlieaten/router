import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { statSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { createHash } from 'node:crypto'
import * as t from '@babel/types'
import { glob } from 'tinyglobby'
import { parseAst } from '@tanstack/router-utils'
import { createStartCompiler } from './start-compiler/host'
import { createViteDevServerFnModuleSpecifierEncoder } from './vite/start-compiler-plugin/module-specifier'
import type {
  GenerateFunctionIdFnOptional,
  ServerFn,
} from './start-compiler/types'

const { version } = createRequire(import.meta.url)(
  '@tanstack/start-plugin-core/package.json',
) as { version: string }

export interface NativeStartCompilerOptions {
  /** The Start web/server app root; both compilers must use the same root. */
  root: string
  platform?: string
  mode?: 'dev' | 'build'
  devServer?: 'vite' | 'rsbuild'
  generateFunctionId?: GenerateFunctionIdFnOptional
}

export function createNativeStartCompiler(options: NativeStartCompilerOptions) {
  const root = path.resolve(options.root)
  const mode = options.mode ?? 'dev'
  const platform = options.platform ?? 'ios'
  const known: Record<string, ServerFn> = {}
  const resolveRelative = (source: string, importer: string) => {
    const resolved = path.resolve(path.dirname(importer), source)
    return (
      [
        resolved,
        ...['tsx', 'ts', 'jsx', 'js', 'mjs', 'cjs'].flatMap((extension) =>
          [
            `.${platform}.${extension}`,
            `.native.${extension}`,
            `.${extension}`,
          ].map((suffix) => resolved + suffix),
        ),
        ...['tsx', 'ts', 'jsx', 'js', 'mjs', 'cjs'].flatMap((extension) =>
          [
            `.${platform}.${extension}`,
            `.native.${extension}`,
            `.${extension}`,
          ].map((suffix) => resolved + '/index' + suffix),
        ),
      ].find((candidate) =>
        statSync(candidate, { throwIfNoEntry: false })?.isFile(),
      ) ?? null
    )
  }
  const compiler = createStartCompiler({
    root,
    mode,
    env: 'client',
    envName: 'native',
    providerEnvName: 'server',
    framework: 'react',
    getKnownServerFns: () => known,
    onServerFnsById: (next) => Object.assign(known, next),
    generateFunctionId: options.generateFunctionId,
    encodeModuleSpecifierInDev:
      mode === 'dev'
        ? options.devServer === 'rsbuild'
          ? ({ extractedFilename }) => pathToFileURL(extractedFilename).href
          : createViteDevServerFnModuleSpecifierEncoder(root)
        : undefined,
    resolveId: async (source, importer) => {
      if (source.startsWith('.')) {
        return resolveRelative(source, importer ?? path.join(root, 'index.ts'))
      }
      try {
        return createRequire(
          importer ?? path.join(root, 'package.json'),
        ).resolve(source)
      } catch {
        return null
      }
    },
    loadModule: async (id) => {
      compiler.ingestModule({ id, code: await readFile(id, 'utf8') })
    },
  })
  return {
    async discover(patterns: Array<string>) {
      const visited = new Set<string>()
      const visit = async (filename: string): Promise<void> => {
        if (visited.has(filename)) {
          return
        }
        visited.add(filename)
        const code = await readFile(filename, 'utf8')
        const transformed = await compiler.compile({ code, id: filename })
        // Handler-only imports are erased from the client graph and must not
        // make unrelated server functions HTTP-accessible in the manifest.
        const ast = parseAst({ code: transformed?.code ?? code, filename })
        for (const node of ast.program.body) {
          if (
            (t.isImportDeclaration(node) && node.importKind !== 'type') ||
            (t.isExportNamedDeclaration(node) &&
              node.exportKind !== 'type' &&
              node.source) ||
            (t.isExportAllDeclaration(node) && node.exportKind !== 'type')
          ) {
            const source = node.source?.value
            if (source?.startsWith('.')) {
              const resolved = resolveRelative(source, filename)
              if (resolved && /\.[cm]?[jt]sx?$/.test(resolved)) {
                await visit(resolved)
              }
            }
          }
        }
      }
      const entries = await glob(patterns, { cwd: root, absolute: true })
      if (patterns.length && !entries.length) {
        throw new Error('No native server-function entries matched')
      }
      for (const filename of entries) {
        await visit(filename)
      }
      return { functions: known, files: Array.from(visited) }
    },
    async transform(code: string, filename: string) {
      // Metro reuses its transformer process across edits. Retire binding caches
      // before ingesting the new module, including query-qualified identities.
      compiler.invalidateModule(filename)
      return compiler.compile({ code, id: filename })
    },
  }
}

export interface MetroTransformInput {
  src: string
  filename: string
  options: {
    dev?: boolean
    platform?: string
    projectRoot?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}
export interface NativeStartMetroOptions {
  root: string
  /** Set build when a development binary talks to a deployed Start server. */
  mode?: 'dev' | 'build'
  devServer?: 'vite' | 'rsbuild'
  generateFunctionId?: GenerateFunctionIdFnOptional
  upstream: {
    transform: (input: MetroTransformInput) => unknown
    getCacheKey?: (...args: Array<any>) => string
  }
}

/** Chain the existing Expo/Metro Babel transformer after Start's real compiler. */
export function createMetroTransformer(options: NativeStartMetroOptions) {
  const compilers = new Map<
    string,
    ReturnType<typeof createNativeStartCompiler>
  >()
  return {
    getCacheKey: (...args: Array<any>) =>
      createHash('sha256')
        .update(
          `tanstack-start-native-v2:${version}:${path.resolve(options.root)}:${options.mode ?? 'auto'}:${options.devServer ?? 'vite'}:${options.generateFunctionId?.toString() ?? ''}:${options.upstream.getCacheKey?.(...args) ?? ''}`,
        )
        .digest('hex'),
    async transform(input: MetroTransformInput) {
      if (
        !/\.[cm]?[jt]sx?$/.test(input.filename) ||
        !/createServerFn|createIsomorphicFn|createServerOnlyFn|createClientOnlyFn|createMiddleware|createStart|\.handler\s*\(|\.server\s*\(|\.client\s*\(/.test(
          input.src,
        )
      ) {
        return options.upstream.transform(input)
      }
      const mode = options.mode ?? (input.options.dev ? 'dev' : 'build')
      const key = `${mode}:${input.options.platform ?? 'ios'}`
      let compiler = compilers.get(key)
      if (!compiler) {
        compiler = createNativeStartCompiler({
          root: options.root,
          mode,
          devServer: options.devServer,
          generateFunctionId: options.generateFunctionId,
          platform: input.options.platform,
        })
        compilers.set(key, compiler)
      }
      const filename = path.resolve(
        input.options.projectRoot ?? options.root,
        input.filename,
      )
      const transformed = await compiler.transform(input.src, filename)
      return options.upstream.transform({
        ...input,
        src: transformed?.code ?? input.src,
      })
    },
  }
}

export async function discoverNativeServerFunctions(
  options: NativeStartCompilerOptions & { entries: Array<string> },
) {
  const discovered = await Promise.all(
    (options.platform ? [options.platform] : ['ios', 'android']).map(
      (platform) =>
        createNativeStartCompiler({
          ...options,
          platform,
          mode: options.mode ?? 'build',
        }).discover(options.entries),
    ),
  )
  return {
    functions: Object.assign(
      {},
      ...discovered.map((result) => result.functions),
    ) as Record<string, ServerFn>,
    files: Array.from(new Set(discovered.flatMap((result) => result.files))),
  }
}
