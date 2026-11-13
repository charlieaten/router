import * as React from 'react'
import { useBlocker, useNavigation } from '@tanstack/react-router'
import { Pressable, Text, TextInput, View } from 'react-native'

export function Composer() {
  const [draft, setDraft] = React.useState('')
  const navigation = useNavigation()
  const blocker = useBlocker({
    disabled: !draft.length,
    shouldBlockFn: () => draft.length > 0,
    withResolver: true,
  })
  return (
    <View
      style={{
        flex: 1,
        padding: 28,
        paddingTop: 45,
        gap: 24,
        backgroundColor: '#f7f5ef',
      }}
    >
      <Text style={{ fontSize: 34, color: '#203d32' }}>
        Tell us what stayed.
      </Text>
      <TextInput
        testID="review"
        multiline
        value={draft}
        onChangeText={setDraft}
        placeholder="The coffee, the courtyard, the conversation…"
        style={{
          padding: 20,
          minHeight: 140,
          backgroundColor: '#e8e5d8',
          borderRadius: 14,
        }}
      />
      <Pressable testID="leave-composer" onPress={() => void navigation.back()}>
        <Text>Close review</Text>
      </Pressable>
      {blocker.status === 'blocked' && (
        <View accessibilityRole="alert">
          <Text>Discard your unfinished review?</Text>
          <Pressable testID="discard" onPress={blocker.proceed}>
            <Text>Discard</Text>
          </Pressable>
          <Pressable onPress={blocker.reset}>
            <Text>Keep writing</Text>
          </Pressable>
        </View>
      )}
    </View>
  )
}
