import { useBlocker, useNavigation } from '@tanstack/react-router'
import { Pressable, Text, TextInput, View } from 'react-native'
import { useReviewComposer } from './use-review-composer'

export function Composer({ venueId }: { venueId: string }) {
  const { draft, setDraft, saving, error, shouldBlock, save } =
    useReviewComposer(venueId)
  const navigation = useNavigation()
  const blocker = useBlocker({
    shouldBlockFn: shouldBlock,
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
      <Pressable
        testID="save-review"
        disabled={saving || !draft.trim()}
        onPress={async () => {
          if (await save()) {
            await navigation.back()
          }
        }}
      >
        <Text>{saving ? 'Saving…' : 'Save review'}</Text>
      </Pressable>
      {error && <Text accessibilityRole="alert">{error}</Text>}
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
