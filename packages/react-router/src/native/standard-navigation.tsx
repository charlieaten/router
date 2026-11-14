import * as React from 'react'
import type {
  NavigatorArgs,
  NavigatorEventArg,
  StandardNavigator,
} from 'standard-navigation'
import type { NativeContainerRenderProps } from './controller'

type EventMap = Record<
  string,
  { data: object | undefined; canPreventDefault: boolean }
>
type MappedProps<TProps> =
  | TProps
  | ((context: NativeContainerRenderProps) => TProps)
type StandardRoute = NativeContainerRenderProps['routes'][number]
type Event<
  TEventMap extends EventMap,
  TEventName extends keyof TEventMap,
> = NavigatorEventArg<
  TEventName,
  TEventMap[TEventName]['canPreventDefault'],
  TEventMap[TEventName]['data']
>

export type StandardNavigationOptions<
  TOptions extends {},
  TEventMap extends EventMap,
  TProps extends object,
> = {
  screenOptions: (context: {
    route: StandardRoute
    item: NativeContainerRenderProps['children'][number]
    navigation: NativeContainerRenderProps['navigation']
  }) => TOptions
  listeners?: {
    [TEventName in keyof TEventMap]?: (
      event: Event<TEventMap, TEventName>,
      context: NativeContainerRenderProps,
    ) => void
  }
} & ({} extends Omit<TProps, keyof NavigatorArgs<TOptions, TEventMap>>
  ? {
      props?: MappedProps<
        Omit<TProps, keyof NavigatorArgs<TOptions, TEventMap>>
      >
    }
  : {
      props: MappedProps<Omit<TProps, keyof NavigatorArgs<TOptions, TEventMap>>>
    })

/** Adapt a version-one Standard Navigator without creating another history owner. */
export function integrateStandardNavigator<
  TOptions extends {},
  TEventMap extends EventMap,
  TProps extends object = {},
>(
  navigator: StandardNavigator<TOptions, TEventMap, TProps>,
  options: StandardNavigationOptions<TOptions, TEventMap, TProps>,
): React.ComponentType<NativeContainerRenderProps> {
  if (navigator.type !== 'standard' || navigator.version !== 1) {
    throw new Error('Unsupported Standard Navigation contract')
  }
  const Content = navigator.NavigatorContent
  return function StandardNavigationHost(context) {
    const props =
      typeof options.props === 'function'
        ? options.props(context)
        : options.props
    return (
      <Content
        {...(props as TProps)}
        {...createStandardNavigationArgs(context, options)}
      />
    )
  }
}

export function createStandardNavigationArgs<
  TOptions extends {},
  TEventMap extends EventMap,
  TProps extends object,
>(
  context: NativeContainerRenderProps,
  options: StandardNavigationOptions<TOptions, TEventMap, TProps>,
): NavigatorArgs<TOptions, TEventMap> {
  const { routes, children, selected, navigation } = context
  const descriptors = Object.fromEntries(
    routes.map((route, index) => {
      const item = children[index]!
      return [
        route.key,
        {
          options: options.screenOptions({ route, item, navigation }),
          render: () => item.content,
        },
      ]
    }),
  )
  const args: NavigatorArgs<TOptions, TEventMap> = {
    state: {
      index: Math.max(
        0,
        routes.findIndex((route) => route.key === selected),
      ),
      routes,
    },
    descriptors,
    actions: { navigate: context.onNavigate, back: context.onBack },
    emitter: {
      emit(input) {
        let prevented = false
        const event = {
          type: input.type,
          target: input.target,
          data: input.data,
        } as unknown as Event<TEventMap, typeof input.type>
        if ('canPreventDefault' in input && input.canPreventDefault) {
          Object.defineProperties(event, {
            defaultPrevented: { enumerable: true, get: () => prevented },
            preventDefault: {
              value: () => {
                prevented = true
              },
            },
          })
        }
        // Removed visits cannot use captured emitters to affect a live ancestor.
        let current = navigation
        let attached = true
        while (current.getOwner()) {
          const owner = current.getOwner()!
          if (
            !owner.navigation
              .getSnapshot()
              .stacks[
                owner.entry.container
              ]?.some((entry) => entry.key === owner.entry.key)
          ) {
            attached = false
            break
          }
          current = owner.navigation
        }
        if (attached) {
          options.listeners?.[input.type]?.(event, context)
        }
        return event
      },
    },
  }
  return args
}
