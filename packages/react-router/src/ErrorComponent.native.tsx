import { Text, View } from 'react-native'

export function ErrorComponent({ error }: { error: unknown }) {
  return (
    <View accessibilityRole="alert">
      <Text>
        {error instanceof Error ? error.message : 'Something went wrong'}
      </Text>
    </View>
  )
}
