import { fileURLToPath } from 'node:url'
import { Generator, getConfig } from '@tanstack/router-generator'

const root = fileURLToPath(new URL('../', import.meta.url))
const config = getConfig(
  {
    target: 'react',
    routesDirectory: './src/routes',
    generatedRouteTree: './src/routeTree.gen.native.ts',
    routeFileIgnorePattern: '^api[.]',
  },
  root,
)
await new Generator({ config, root }).run()
