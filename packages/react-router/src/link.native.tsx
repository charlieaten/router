import * as React from 'react'
import { Pressable, Text } from 'react-native'
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
  activeOptions?: { exact?: boolean; includeSearch?: boolean }
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

export function useLinkProps(
  options: LinkProps,
): PressableProps & { isActive: boolean } {
  const router = useRouter()
  const navigate = useNavigate()
  const href = router.buildLocation(options as never).href
  const current = useRouterState({ select: (state) => state.location.href })
  const isActive = options.activeOptions?.exact
    ? current === href
    : current.split('?')[0] === href.split('?')[0]
  return {
    accessibilityRole: 'link' as const,
    disabled: options.disabled,
    ...(isActive ? options.activeProps : options.inactiveProps),
    onPress: (event: Parameters<NonNullable<PressableProps['onPress']>>[0]) => {
      options.onPress?.(event)
      if (!options.disabled && !event.isDefaultPrevented()) {
        void navigate(options as never)
      }
    },
    onPressIn: (
      event: Parameters<NonNullable<PressableProps['onPressIn']>>[0],
    ) => {
      options.onPressIn?.(event)
      if (options.preload && !options.disabled) {
        void router.preloadRoute(options as never)
      }
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
