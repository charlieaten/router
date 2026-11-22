import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { Generator, getConfig } from '../src'

it('filters actual route subtrees by platform and responds to metadata edits', async () => {
  const root = await mkdtemp(join(tmpdir(), 'router-platform-'))
  try {
    const routesDirectory = join(root, 'routes')
    await mkdir(join(routesDirectory, 'browser'), { recursive: true })
    await mkdir(join(routesDirectory, 'device'))
    await writeFile(
      join(routesDirectory, '__root.tsx'),
      "import { createRootRoute } from '@tanstack/react-router'\nexport const Route = createRootRoute()",
    )
    const writeRoute = (file: string, id: string, options = '{}') =>
      writeFile(
        join(routesDirectory, file),
        `import { createFileRoute } from '@tanstack/react-router'\nexport const Route = createFileRoute('${id}')(${options})`,
      )
    await writeRoute('browser/route.tsx', '/browser', "{ platform: 'web' }")
    await writeRoute('browser/index.tsx', '/browser/')
    await writeRoute('device/index.tsx', '/device/', "{ platform: 'native' }")
    const generatorFor = (routePlatform?: 'web' | 'native') => {
      const generatedRouteTree = join(
        root,
        `${routePlatform ?? 'catalog'}.gen.ts`,
      )
      return {
        generate: new Generator({
          root,
          config: getConfig({
            routesDirectory,
            generatedRouteTree,
            routePlatform,
          }),
        }),
        read: () => readFile(generatedRouteTree, 'utf8'),
      }
    }

    const web = generatorFor('web')
    const native = generatorFor('native')
    const catalog = generatorFor()
    for (const output of [web, native, catalog]) {
      await output.generate.run()
    }
    expect(await web.read()).toContain('./routes/browser/index')
    expect(await web.read()).not.toContain('./routes/device/index')
    expect(await native.read()).toContain('./routes/device/index')
    expect(await native.read()).not.toContain('./routes/browser/')
    expect(await catalog.read()).toContain('./routes/browser/index')
    expect(await catalog.read()).toContain('./routes/device/index')

    await writeRoute('browser/route.tsx', '/browser')
    await native.generate.run({
      type: 'update',
      path: join(routesDirectory, 'browser/route.tsx'),
    })
    expect(await native.read()).toContain('./routes/browser/index')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

it('generates one unfiltered type catalog for platform-specific JavaScript trees', async () => {
  const root = await mkdtemp(join(tmpdir(), 'router-shared-types-'))
  try {
    const routesDirectory = join(root, 'routes')
    await mkdir(routesDirectory)
    await writeFile(
      join(routesDirectory, '__root.tsx'),
      "import {createRootRoute} from '@tanstack/react-router'; export const Route=createRootRoute()",
    )
    await writeFile(
      join(routesDirectory, 'shared.tsx'),
      "import {createFileRoute} from '@tanstack/react-router'; export const Route=createFileRoute('/shared')({})",
    )
    await writeFile(
      join(routesDirectory, 'dashboard.tsx'),
      "import {createFileRoute} from '@tanstack/react-router'; export const Route=createFileRoute('/dashboard')({platform:'web'})",
    )
    const generator = new Generator({
      root,
      config: getConfig(
        {
          routesDirectory,
          generatedRouteTree: join(root, 'runtime.native.js'),
          disableTypes: true,
          routePlatform: 'native',
          routeFileIgnorePattern: '^dashboard',
          routeTreeFileFooter: ['export type FooterMarker = true'],
          routeTypes: {
            generatedRouteTree: join(root, 'routes.gen.ts'),
            routeFileIgnorePattern: '',
          },
        },
        root,
      ),
    })
    await generator.run()
    expect(
      await readFile(join(root, 'runtime.native.js'), 'utf8'),
    ).not.toContain('./routes/dashboard')
    const catalog = await readFile(join(root, 'routes.gen.ts'), 'utf8')
    expect(catalog).toContain('./routes/dashboard')
    expect(catalog).toContain('interface FileRoutesByPath')
    const declaration = await readFile(
      join(root, 'runtime.native.d.ts'),
      'utf8',
    )
    expect(declaration).toContain('export *')
    expect(declaration).toContain('export type FooterMarker')
    expect(
      await readFile(join(root, 'runtime.native.js'), 'utf8'),
    ).not.toContain('FooterMarker')
    await rm(join(root, 'runtime.native.d.ts'))
    await generator.run({
      type: 'delete',
      path: join(root, 'runtime.native.d.ts'),
    })
    expect(await readFile(join(root, 'runtime.native.d.ts'), 'utf8')).toBe(
      declaration,
    )
    expect(await readFile(join(root, 'runtime.native.d.ts'), 'utf8')).toContain(
      "from './routes.gen'",
    )
    await rm(join(routesDirectory, 'shared.tsx'))
    await generator.run()
    expect(await readFile(join(root, 'routes.gen.ts'), 'utf8')).not.toContain(
      './routes/shared',
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

it('validates separate JavaScript, declaration and catalog paths', () => {
  for (const [runtime, catalog] of [
    ['runtime.mjs', 'types.ts'],
    ['runtime.js', 'runtime.d.ts'],
    ['runtime.js', 'types.js'],
  ]) {
    expect(() =>
      getConfig(
        {
          generatedRouteTree: runtime,
          disableTypes: true,
          routeTypes: { generatedRouteTree: catalog! },
        },
        '/tmp',
      ),
    ).toThrow('routeTypes requires')
  }
})

it('rejects type catalogs that shadow the runtime module', () => {
  for (const catalog of ['runtime.ts', 'runtime.tsx', 'types.d.ts']) {
    expect(() =>
      getConfig(
        {
          generatedRouteTree: 'runtime.js',
          disableTypes: true,
          routeTypes: { generatedRouteTree: catalog },
        },
        '/tmp',
      ),
    ).toThrow('routeTypes requires')
  }
})
