import * as React from 'react'
import { useRouter } from './useRouter'
import { navigateNative } from './native/controller'
import type {
  AnyRouter,
  FromPathOption,
  NavigateOptions,
  RegisteredRouter,
  UseNavigateResult,
} from '@tanstack/router-core'

export function useNavigate<
  TRouter extends AnyRouter = RegisteredRouter,
  TDefaultFrom extends string = string,
>(defaults?: {
  from?: FromPathOption<TRouter, TDefaultFrom>
}): UseNavigateResult<TDefaultFrom> {
  const router = useRouter()
  return React.useCallback(
    (options: NavigateOptions) =>
      navigateNative(router, {
        ...options,
        from: options.from ?? defaults?.from,
      }),
    [router, defaults?.from],
  ) as UseNavigateResult<TDefaultFrom>
}

export function Navigate(props: NavigateOptions) {
  const navigate = useNavigate()
  React.useEffect(() => {
    void navigate(props)
  }, [navigate, props])
  return null
}
