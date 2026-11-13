const path = require('node:path')
const { getDefaultConfig } = require('expo/metro-config')
const config = getDefaultConfig(__dirname)
const workspace = path.resolve(__dirname, '../../../..')

config.watchFolders = [workspace]
config.resolver.unstable_conditionNames = ['require', 'react-native']
// One React instance belongs to the native app, including shared workspace code.
const previous = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, name, platform) => {
  if (name === 'react' || name.startsWith('react/')) {
    return {
      type: 'sourceFile',
      filePath: require.resolve(name, { paths: [__dirname] }),
    }
  }
  return previous
    ? previous(context, name, platform)
    : context.resolveRequest(context, name, platform)
}

module.exports = config
