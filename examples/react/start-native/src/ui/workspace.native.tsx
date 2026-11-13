import * as React from 'react'
import {
  Link,
  Outlet,
  useNavigate,
  useNavigation,
} from '@tanstack/react-router'
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'

const colors = {
  ink: '#203d32',
  muted: '#73796b',
  paper: '#f7f5ef',
  card: '#e8e5d8',
}
function Button({
  title,
  onPress,
  testID,
}: {
  title: string
  onPress: () => void
  testID?: string
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      style={{ backgroundColor: colors.card, padding: 13, borderRadius: 12 }}
    >
      <Text style={{ color: colors.ink, fontWeight: '600' }}>{title}</Text>
    </Pressable>
  )
}
export function Workspace({
  workspaceId,
  execution,
}: {
  workspaceId: string
  execution: string
}): React.JSX.Element {
  const [count, setCount] = React.useState(0)
  const navigate = useNavigate()
  return (
    <SafeAreaProvider>
      <SafeAreaView
        edges={['top', 'bottom']}
        style={{ flex: 1, backgroundColor: colors.paper }}
      >
        <View style={{ padding: 18, gap: 10 }}>
          <Text style={{ color: colors.muted, fontSize: 11, letterSpacing: 2 }}>
            PARENT VISIT / {execution}
          </Text>
          <Text style={{ color: colors.ink, fontSize: 23, fontWeight: '600' }}>
            Workspace {workspaceId}
          </Text>
          <Text style={{ color: colors.muted, lineHeight: 20 }}>
            Change tabs, push pages and write a draft. Open another visit, then
            use the top Back button to recover this one.
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button
              title={`Parent counter: ${count}`}
              testID="parent-counter"
              onPress={() => setCount((value) => value + 1)}
            />
            <Button
              title="Open another visit"
              testID="duplicate-workspace"
              onPress={() => {
                void navigate({
                  to: '/workspaces/$workspaceId',
                  params: { workspaceId },
                })
              }}
            />
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <Outlet />
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  )
}
export function WorkspacePage({
  workspaceId,
  section,
  page,
}: {
  workspaceId: string
  section: string
  page: string
}): React.JSX.Element {
  const [draft, setDraft] = React.useState('')
  const navigation = useNavigation()
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: colors.paper }}
      contentContainerStyle={{ padding: 24, gap: 18 }}
    >
      <Text style={{ color: colors.ink, fontSize: 32, fontWeight: '600' }}>
        {section === 'feed' ? 'Feed' : 'Search'} · Page {page}
      </Text>
      <Text style={{ color: colors.muted }}>
        This page and its draft belong to this parent visit’s {section} stack.
      </Text>
      <TextInput
        testID="workspace-draft"
        accessibilityLabel="Page draft"
        placeholder="A draft for this page…"
        value={draft}
        onChangeText={setDraft}
        style={{
          padding: 16,
          borderRadius: 12,
          backgroundColor: 'white',
          color: colors.ink,
        }}
      />
      <Link
        testID="push-nested-page"
        to="/workspaces/$workspaceId/$section/$page"
        params={{ workspaceId, section, page: String(Number(page) + 1) }}
        style={{ padding: 16, borderRadius: 12, backgroundColor: colors.ink }}
      >
        <Text style={{ color: 'white' }}>Push page {Number(page) + 1}</Text>
      </Link>
      <Button
        title="Back within this visit"
        testID="nested-back"
        onPress={() => {
          void navigation.back()
        }}
      />
    </ScrollView>
  )
}
