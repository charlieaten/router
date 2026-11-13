import { createServerFn } from '@tanstack/react-start'
export const serverHelper = () => 'server value'
export const privilegedFn = createServerFn().handler(
  () => 'private implementation',
)
