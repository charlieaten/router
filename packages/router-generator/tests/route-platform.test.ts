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
