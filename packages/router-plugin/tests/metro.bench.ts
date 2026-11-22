import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import { withTanStackRouter } from '../src/metro'

for (const count of [50, 300]) {
  for (const sharedTypes of [false, true]) {
    test(`Metro config generation: ${count} routes, shared types ${sharedTypes}`, async ({
      bench,
    }) => {
      const root = await mkdtemp(path.join(tmpdir(), 'metro-generation-bench-'))
      try {
        const routesDirectory = path.join(root, 'routes')
        await mkdir(routesDirectory)
        await writeFile(
          path.join(routesDirectory, '__root.tsx'),
          "import {createRootRoute} from '@tanstack/react-router'; export const Route=createRootRoute()",
        )
        await Promise.all(
          Array.from({ length: count }, (_, index) =>
            writeFile(
              path.join(routesDirectory, `route-${index}.tsx`),
              `import {createFileRoute} from '@tanstack/react-router'; export const Route=createFileRoute('/route-${index}')({})`,
            ),
          ),
        )
        const run = () =>
          withTanStackRouter(
            {},
            {
              root,
              watch: false,
              config: {
                routesDirectory,
                generatedRouteTree: path.join(root, 'runtime.js'),
                disableTypes: true,
                disableLogging: true,
                routePlatform: 'native',
                ...(sharedTypes
                  ? {
                      routeTypes: {
                        generatedRouteTree: path.join(root, 'types.ts'),
                      },
                    }
                  : {}),
              },
            },
          )
        await run()
        expect(await readFile(path.join(root, 'runtime.js'), 'utf8')).toContain(
          './routes/route-0',
        )
        if (sharedTypes) {
          expect(
            await readFile(path.join(root, 'runtime.d.ts'), 'utf8'),
          ).toContain('export *')
        }
        const result = await bench(`generate-${count}-${sharedTypes}`, run).run(
          { time: 1000, warmupIterations: 3 },
        )
        console.log(
          JSON.stringify({
            name: result.name,
            meanMs: result.latency.mean,
            p99Ms: result.latency.p99,
            p999Ms: result.latency.p999,
            rme: result.latency.rme,
            samples: result.latency.samplesCount,
          }),
        )
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    })
  }
}
