import type {
  NativeContainerRenderProps,
  NativeNavigatorOptions,
} from './native/controller'

export interface StackOptions {
  initialRoute: string
  id?: string
  presenter?: NativeNavigatorOptions['renderStack']
  stackHost?: NativeNavigatorOptions['stackHost']
}

function StackSurface({ children, selected }: NativeContainerRenderProps) {
  return children.find((item) => item.key === selected)?.content
}

/** Opt a router or layout route into native stack presentation. */
export function stack(options: StackOptions): NativeNavigatorOptions {
  const id = options.id ?? 'main'
  return {
    rootKind: 'custom',
    initialContainer: id,
    containers: { [id]: { initialHref: options.initialRoute, kind: 'stack' } },
    renderContainer: StackSurface,
    renderStack: options.presenter,
    stackHost: options.stackHost,
  }
}
