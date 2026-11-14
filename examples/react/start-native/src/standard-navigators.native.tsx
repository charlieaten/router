import * as React from 'react'
import {
  AccessibilityInfo,
  Image,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'
import LottieView from 'lottie-react-native'
import Animated, {
  Easing,
  ReduceMotion,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import { useFonts } from 'expo-font'
import * as Haptics from 'expo-haptics'
import { TabBar, TabView } from 'react-native-tab-view'
import { createStandardNavigator } from 'standard-navigation'

type Options = { title: string }
type Events = {
  tabPress: { data: { isAlreadyFocused: boolean }; canPreventDefault: true }
}
const animations: Record<
  string,
  React.ComponentProps<typeof LottieView>['source']
> = {
  map: require('./assets/tastebuds/map.json'),
  explore: require('./assets/tastebuds/explore.json'),
  post: require('./assets/tastebuds/post.json'),
  activity: require('./assets/tastebuds/activity.json'),
}
// Ported from Tastebuds AnimatedSavedTabIcon: same geometry, easing and curve.
function SavedTabButton({
  focused,
  onPress,
}: {
  focused: boolean
  onPress: () => void
}) {
  const progress = useSharedValue(0)
  const [imageFailed, setImageFailed] = React.useState(false)
  const [fontLoaded] = useFonts({
    PretendardSemiBold: require('./assets/tastebuds/Pretendard-SemiBold.otf'),
  })
  const style = useAnimatedStyle(() => {
    const minScale = 0.85
    const downEnd = 160 / (160 + 320)
    const ease = Easing.out(Easing.ease)
    const p = Math.max(0, Math.min(progress.value, 1))
    const scale =
      p <= downEnd
        ? 1 + (minScale - 1) * ease(p / downEnd)
        : minScale + (1 - minScale) * ease((p - downEnd) / (1 - downEnd))
    return { transform: [{ scale }] }
  })
  React.useEffect(() => {
    if (!focused) {
      cancelAnimation(progress)
      progress.value = 0
    }
  }, [focused, progress])
  return (
    <Pressable
      testID="lab-tab-saved"
      accessibilityRole="tab"
      accessibilityLabel="My"
      accessibilityState={{ selected: focused }}
      onPressIn={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        progress.value = 0
        progress.value = withTiming(1, {
          duration: 480,
          reduceMotion: ReduceMotion.System,
        })
      }}
      onPress={onPress}
      style={{ flex: 1, alignItems: 'center' }}
    >
      <Animated.View
        style={[
          {
            width: 72,
            height: 60,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
          },
          style,
        ]}
      >
        {imageFailed ? (
          <Svg width={24} height={24} viewBox="0 0 24 24">
            <Path
              d="M21,20a2,2,0,0,1-2,2H5a2,2,0,0,1-2-2,6,6,0,0,1,6-6h6A6,6,0,0,1,21,20Zm-9-8A5,5,0,1,0,7,7,5,5,0,0,0,12,12Z"
              fill={focused ? '#333333' : '#BBBBBB'}
            />
          </Svg>
        ) : (
          <Image
            source={require('./assets/tastebuds/avatar.jpg')}
            onError={() => setImageFailed(true)}
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              opacity: focused ? 1 : 0.6,
            }}
          />
        )}
        <Text
          style={{
            fontFamily: fontLoaded ? 'PretendardSemiBold' : undefined,
            fontWeight: fontLoaded ? undefined : '600',
            fontSize: 11,
            lineHeight: 15.4,
            color: focused ? '#333333' : '#BBBBBB',
          }}
        >
          My
        </Text>
      </Animated.View>
    </Pressable>
  )
}

function AnimatedIcon({ name, focused }: { name: string; focused: boolean }) {
  const ref = React.useRef<LottieView>(null)
  const [reduceMotion, setReduceMotion] = React.useState(true)
  React.useEffect(() => {
    let live = true
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (live) {
        setReduceMotion(value)
      }
    })
    const sub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    )
    return () => {
      live = false
      sub.remove()
    }
  }, [])
  React.useEffect(() => {
    if (focused && !reduceMotion) {
      ref.current?.play()
    } else {
      ref.current?.reset()
    }
  }, [focused, reduceMotion])
  const source = animations[name]
  return source ? (
    <LottieView
      ref={ref}
      source={source}
      loop={false}
      progress={focused ? 1 : 0}
      style={{ width: 72, height: 60 }}
    />
  ) : (
    <Text style={{ fontSize: 25, height: 40, textAlign: 'center' }}>
      {name === 'saved' ? '♡' : '◎'}
    </Text>
  )
}

// This navigator imports no TanStack or React Navigation APIs.
export const TastebudsTabs = createStandardNavigator<Options, Events>(
  ({ state, descriptors, actions, emitter }) => (
    <View style={{ flex: 1, backgroundColor: '#fafaf7' }}>
      <View style={{ flex: 1 }}>
        {state.routes.map((route, index) => (
          <React.Activity
            key={route.key}
            mode={index === state.index ? 'visible' : 'hidden'}
          >
            {descriptors[route.key]!.render()}
          </React.Activity>
        ))}
      </View>
      <View
        style={{
          flexDirection: 'row',
          borderTopWidth: 1,
          borderColor: '#e8e8e0',
          backgroundColor: 'white',
          paddingTop: 2,
          height: 68,
          alignItems: 'center',
        }}
      >
        {state.routes.map((route, index) => {
          const focused = state.index === index
          const press = () => {
            const event = emitter.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
              data: { isAlreadyFocused: focused },
            })
            if (!event.defaultPrevented) {
              actions.navigate(route.name)
            }
          }
          if (route.name === 'saved') {
            return (
              <SavedTabButton
                key={route.key}
                focused={focused}
                onPress={press}
              />
            )
          }
          return (
            <Pressable
              key={route.key}
              testID={`lab-tab-${route.name}`}
              accessibilityRole="tab"
              accessibilityLabel={descriptors[route.key]!.options.title}
              accessibilityState={{ selected: focused }}
              onPress={press}
              style={{
                flex: 1,
                alignItems: 'center',
                opacity: focused ? 1 : 0.55,
              }}
            >
              <AnimatedIcon name={route.name} focused={focused} />
            </Pressable>
          )
        })}
      </View>
    </View>
  ),
)

// Uses the same TabView/TabBar presentation primitives as Material Top Tabs.
export const MaterialTabs = createStandardNavigator<Options, Events>(
  ({ state, descriptors, actions, emitter }) => {
    const { width } = useWindowDimensions()
    const select = (key: string) => {
      const route = state.routes.find((route) => route.key === key)!
      const event = emitter.emit({
        type: 'tabPress',
        target: key,
        canPreventDefault: true,
        data: { isAlreadyFocused: state.routes[state.index]?.key === key },
      })
      if (!event.defaultPrevented) {
        actions.navigate(route.name)
      }
    }
    return (
      <TabView
        navigationState={state}
        initialLayout={{ width }}
        onIndexChange={(index) => select(state.routes[index]!.key)}
        renderScene={({ route }) => descriptors[route.key]!.render()}
        renderTabBar={(props) => (
          <TabBar
            {...props}
            onTabPress={({ route, preventDefault }) => {
              preventDefault()
              select(route.key)
            }}
            options={Object.fromEntries(
              state.routes.map((route) => [
                route.key,
                {
                  labelText: descriptors[route.key]!.options.title,
                  testID: `lab-top-${route.name}`,
                },
              ]),
            )}
            style={{ backgroundColor: 'white' }}
            activeColor="#233d32"
            inactiveColor="#93988f"
            indicatorStyle={{ backgroundColor: '#38b9a0' }}
          />
        )}
      />
    )
  },
)
