import * as React from 'react'
import { Pressable, Text } from 'react-native'
import {
  deepEqual,
  getUrlScheme,
  removeTrailingSlash,
} from '@tanstack/router-core'
import { useRouter } from './useRouter'
import { useRouterState } from './useRouterState'
import { useNavigate } from './useNavigate.native'
import type { PressableProps } from 'react-native'
import type {
  AnyRouter,
  LinkOptions,
  RegisteredRouter,
} from '@tanstack/router-core'
import type {
  ValidateLinkOptions,
  ValidateLinkOptionsArray,
} from './typePrimitives'

export type ActiveLinkOptions<
  TComp = 'a',
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string | undefined = '.',
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '.',
> = LinkOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo> & {
  activeProps?: Partial<PressableProps>
  inactiveProps?: Partial<PressableProps>
  activeOptions?: {
    exact?: boolean
    includeSearch?: boolean
    includeHash?: boolean
    explicitUndefined?: boolean
  }
}

export type LinkProps<
  TComp = 'a',
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string | undefined = '.',
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '.',
> = ActiveLinkOptions<TComp, TRouter, TFrom, TTo, TMaskFrom, TMaskTo> &
  Omit<PressableProps, 'children'> & {
    children?:
      | React.ReactNode
      | ((state: { isActive: boolean }) => React.ReactNode)
    ref?: React.Ref<any>
    _asChild?: React.ComponentType<any>
  }

export type UseLinkPropsOptions = LinkProps
export type LinkComponentProps<
  TComp = 'a',
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string | undefined = '.',
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '.',
> = LinkProps<TComp, TRouter, TFrom, TTo, TMaskFrom, TMaskTo>
export type CreateLinkProps = LinkProps<
  any,
  any,
  string,
  string,
  string,
  string
>
export type LinkComponent<TComp = 'a', TDefaultFrom extends string = string> = <
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string = TDefaultFrom,
  const TTo extends string | undefined = undefined,
  const TMaskFrom extends string = TFrom,
  const TMaskTo extends string = '',
>(
  props: LinkComponentProps<TComp, TRouter, TFrom, TTo, TMaskFrom, TMaskTo>,
) => React.ReactElement

export interface LinkComponentRoute<TDefaultFrom extends string = string> {
  defaultFrom: TDefaultFrom;
  <
    TRouter extends AnyRouter = RegisteredRouter,
    const TTo extends string | undefined = undefined,
    const TMaskTo extends string = '',
  >(
    props: LinkComponentProps<
      'a',
      TRouter,
      this['defaultFrom'],
      TTo,
      this['defaultFrom'],
      TMaskTo
    >,
  ): React.ReactElement
}

const routingProps = new Set([
  'to',
  'from',
  'params',
  'search',
  'hash',
  'state',
  'href',
  'mask',
  'replace',
  'resetScroll',
  'hashScrollIntoView',
  'viewTransition',
  'ignoreBlocker',
  'reloadDocument',
  'preload',
  'preloadDelay',
  'preloadIntentProximity',
  'activeOptions',
  'activeProps',
  'inactiveProps',
  'target',
  'stackBehavior',
  'stackMatch',
  'stackFallback',
  'entryId',
  'children',
  'ref',
  '_asChild',
])

export function useLinkProps(
  options: LinkProps,
): PressableProps & { isActive: boolean } {
  const router = useRouter()
  const navigate = useNavigate()
  const external = typeof options.to === 'string' && getUrlScheme(options.to)
  const next = external ? undefined : router.buildLocation(options as never)
  const current = useRouterState({ select: (state) => state.location })
  const activeOptions = options.activeOptions
  const currentPath = removeTrailingSlash(current.pathname, router.basepath)
  const nextPath = next
    ? removeTrailingSlash(next.pathname, router.basepath)
    : ''
  const pathMatches =
    !!next &&
    (activeOptions?.exact
      ? currentPath === nextPath
      : currentPath.startsWith(nextPath) &&
        (currentPath.length === nextPath.length ||
          currentPath[nextPath.length] === '/'))
  const isActive =
    pathMatches &&
    (!(activeOptions?.includeSearch ?? true) ||
      deepEqual(
        current.search,
        next.search,
        !activeOptions?.exact,
        activeOptions?.explicitUndefined,
      )) &&
    (!activeOptions?.includeHash || current.hash === next.hash)
  const hostProps = Object.fromEntries(
    Object.entries(options).filter(([key]) => !routingProps.has(key)),
  ) as PressableProps
  const selectedProps = isActive ? options.activeProps : options.inactiveProps
  const baseStyle = hostProps.style
  const selectedStyle = selectedProps?.style
  const style: PressableProps['style'] = selectedStyle
    ? typeof baseStyle === 'function' || typeof selectedStyle === 'function'
      ? (state) => [
          typeof baseStyle === 'function' ? baseStyle(state) : baseStyle,
          typeof selectedStyle === 'function'
            ? selectedStyle(state)
            : selectedStyle,
        ]
      : [baseStyle, selectedStyle]
    : baseStyle
  const preload = () => {
    if (
      !external &&
      !options.disabled &&
      (options.preload ?? router.options.defaultPreload)
    ) {
      void router.preloadRoute(options as never).catch((error) => {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(error)
        }
      })
    }
  }
  return {
    ...hostProps,
    ...selectedProps,
    style,
    accessibilityRole: 'link',
    accessibilityState: {
      ...hostProps.accessibilityState,
      ...selectedProps?.accessibilityState,
      disabled: !!options.disabled,
      selected: isActive,
    },
    disabled: options.disabled,
    onPress: (event) => {
      hostProps.onPress?.(event)
      if (selectedProps?.onPress !== hostProps.onPress) {
        selectedProps?.onPress?.(event)
      }
      if (!options.disabled && !event.isDefaultPrevented()) {
        void navigate(options as never)
      }
    },
    onPressIn: (event) => {
      hostProps.onPressIn?.(event)
      preload()
    },
    onHoverIn: (event) => {
      hostProps.onHoverIn?.(event)
      preload()
    },
    isActive,
  }
}

export const Link = React.forwardRef<any, LinkProps>(
  function NativeLink(props, ref) {
    const { isActive, ...link } = useLinkProps(props)
    const Host = props._asChild ?? Pressable
    const children =
      typeof props.children === 'function'
        ? props.children({ isActive })
        : props.children
    return (
      <Host
        ref={ref}
        style={props.style}
        testID={props.testID}
        accessibilityLabel={props.accessibilityLabel}
        {...link}
      >
        {typeof children === 'string' ? <Text>{children}</Text> : children}
      </Host>
    )
  },
) as LinkComponent

export function createLink<TComp>(component: TComp): LinkComponent<TComp> {
  return React.forwardRef<any, CreateLinkProps>((props, ref) => (
    <Link {...(props as any)} _asChild={component} ref={ref} />
  )) as LinkComponent<TComp>
}

export const linkOptions: <
  const TOptions,
  TRouter extends AnyRouter = RegisteredRouter,
>(
  options: TOptions extends ReadonlyArray<any>
    ? ValidateLinkOptionsArray<TRouter, TOptions>
    : ValidateLinkOptions<TRouter, TOptions>,
) => TOptions = (options) => options as never
