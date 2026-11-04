// Jest's module resolver: Reanimated's, then React Native's.
//
// Since Reanimated 4.7 (SDK 58) its mock is no longer enough on its own: a
// few of its modules must be resolved to their web builds under Jest, or the
// native initializer runs and throws "`setCSSEventHandler` is not available
// in JSReanimated". Its resolver does that (and hands everything else to
// Worklets', which does the same for react-native-worklets). jest-expo's
// preset already set React Native's resolver, which lets tests reach
// `react-native/...` subpaths; setting `resolver` here replaces it, so it is
// chained in as the default the other two fall back to.
const reanimatedResolver = require("react-native-reanimated/jest/resolver");
const reactNativeResolver = require("@react-native/jest-preset/jest/resolver");

module.exports = (request, options) =>
  reanimatedResolver(request, {
    ...options,
    defaultResolver: (path, inner) =>
      reactNativeResolver(path, {
        ...inner,
        defaultResolver: options.defaultResolver,
      }),
  });
