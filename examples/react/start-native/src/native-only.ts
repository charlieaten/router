import { createServerFn } from '@tanstack/react-start'

// Absent from the web route graph; registered through nativeEntries instead.
export const nativeOnlyStatus = createServerFn().handler(() => ({
  source: 'native-only-server-function',
}))
