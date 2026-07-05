module.exports = function (api) {
  api.cache(true);
  const isTest = process.env.NODE_ENV === "test";

  if (isTest) {
    // Under Jest, skip the nativewind preset/plugin (its CSS-interop transform
    // hoists references that babel-jest can't resolve in test files).
    return {
      presets: [["babel-preset-expo"]],
    };
  }

  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    plugins: ["react-native-reanimated/plugin"],
  };
};
