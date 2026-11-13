import { createServerFn } from '@tanstack/react-start'
import { serverHelper } from './server-only'
export const publicFn = createServerFn().handler(() => serverHelper())
