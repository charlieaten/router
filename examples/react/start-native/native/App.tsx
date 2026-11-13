import { SafeAreaProvider } from 'react-native-safe-area-context'
import { RouterProvider } from '@tanstack/react-router'
import { configureNativeStart } from '@tanstack/react-start'
import { fetch as expoFetch } from 'expo/fetch'
import { apiOrigin } from '../src/platform-config'
import { getRouter } from '../src/router'

configureNativeStart({ origin: apiOrigin, fetch: expoFetch })
const router = getRouter()

export default function App() {
  return (
    <SafeAreaProvider>
      <RouterProvider router={router} />
    </SafeAreaProvider>
  )
}
