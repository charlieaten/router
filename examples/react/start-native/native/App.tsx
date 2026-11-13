import { SafeAreaProvider } from 'react-native-safe-area-context'
import { RouterProvider } from '@tanstack/react-router'
import { getRouter } from '../src/router'

const router = getRouter()

export default function App() {
  return (
    <SafeAreaProvider>
      <RouterProvider router={router} />
    </SafeAreaProvider>
  )
}
