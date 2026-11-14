import * as React from 'react'
import { Outlet, useNavigate, useNavigation } from '@tanstack/react-router'
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
const ink = '#233d32'
function Button({
  title,
  onPress,
  testID,
}: {
  title: string
  onPress: () => void
  testID: string
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      style={{ padding: 12, borderRadius: 10, backgroundColor: '#e7eee7' }}
    >
      <Text style={{ color: ink, fontWeight: '600' }}>{title}</Text>
    </Pressable>
  )
}
export function NavigationLab(): React.JSX.Element {
  const [count, setCount] = React.useState(0)
  const navigate = useNavigate()
  return (
    <SafeAreaProvider>
      <SafeAreaView
        edges={['top', 'bottom']}
        style={{ flex: 1, backgroundColor: '#fafaf7' }}
      >
        <View style={{ padding: 18, gap: 9 }}>
          <Text style={{ fontSize: 11, color: '#7c8b7d', letterSpacing: 2 }}>
            TANSTACK × STANDARD NAVIGATION
          </Text>
          <Text style={{ fontSize: 27, fontWeight: '700', color: ink }}>
            Your places, your people.
          </Text>
          <Text style={{ color: '#7c8b7d' }}>
            Post opens a sheet. Tap Saved twice to toggle its pager.
          </Text>
          <View style={{ flexDirection: 'row', gap: 9 }}>
            <Button
              testID="lab-counter"
              title={`Visit counter: ${count}`}
              onPress={() => setCount(count + 1)}
            />
            <Button
              testID="lab-duplicate"
              title="New visit"
              onPress={() => {
                void navigate({ to: '/navigation-lab' })
              }}
            />
          </View>
        </View>
        <Outlet />
      </SafeAreaView>
    </SafeAreaProvider>
  )
}
export function LabPage({
  section,
  page,
  saved,
}: {
  section: string
  page: string
  saved: boolean
}): React.JSX.Element {
  const [draft, setDraft] = React.useState('')
  const navigate = useNavigate()
  const navigation = useNavigation()
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#fafaf7' }}
      contentContainerStyle={{ padding: 22, gap: 18 }}
    >
      <Text style={{ color: '#80917f', fontSize: 11, letterSpacing: 2 }}>
        {saved ? 'YOUR SAVED PLACES' : 'NEIGHBOURHOOD NOTES'} / PAGE {page}
      </Text>
      <Text style={{ color: ink, fontSize: 34, fontWeight: '600' }}>
        {section.charAt(0).toUpperCase() + section.slice(1)}
      </Text>
      <Text style={{ color: '#788271', lineHeight: 22 }}>
        A little corner that stays yours. Push a page and leave a note, then
        switch tabs or open another visit.
      </Text>
      <View
        style={{
          padding: 20,
          backgroundColor: '#e8eddf',
          borderRadius: 20,
          gap: 12,
        }}
      >
        <Text style={{ fontSize: 26 }}>☕</Text>
        <Text style={{ fontSize: 21, color: ink, fontWeight: '600' }}>
          Somewhere worth returning to
        </Text>
        <Text style={{ color: '#788271' }}>
          Good coffee · Familiar faces · A slower afternoon
        </Text>
      </View>
      <TextInput
        testID="lab-draft"
        accessibilityLabel={`${section} draft`}
        value={draft}
        onChangeText={setDraft}
        placeholder="Leave a note for this page…"
        style={{
          padding: 16,
          borderRadius: 12,
          backgroundColor: 'white',
          color: ink,
        }}
      />
      <View style={{ flexDirection: 'row', gap: 9 }}>
        <Button
          testID="lab-push"
          title={`Push page ${Number(page) + 1}`}
          onPress={() => {
            if (saved) {
              void navigate({
                to: '/navigation-lab/saved/$section/$page',
                params: { section, page: String(Number(page) + 1) },
              })
            } else {
              void navigate({
                to: '/navigation-lab/$tab/$page',
                params: { tab: section, page: String(Number(page) + 1) },
              })
            }
          }}
        />
        <Button
          testID="lab-back"
          title="Back"
          onPress={() => {
            void navigation.back()
          }}
        />
      </View>
    </ScrollView>
  )
}
