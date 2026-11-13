# Universal Start / native experiment

Shared TanStack file routes, params, search, loaders and context; Start web/server
plus an Expo development client using Screens v5.

See [architecture, commands, verification and limits](../../../UNIVERSAL-NATIVE-EXPERIMENT.md).

From the repository root, build workspace dependencies through Nx, then:

```sh
pnpm --filter tanstack-start-example-native dev
# another terminal
pnpm --filter tanstack-start-native-client ios
```

Use `EXPO_PUBLIC_API_ORIGIN=http://10.0.2.2:3050` for Android emulator networking.
This is an experimental adapter, not complete React Navigation parity.
