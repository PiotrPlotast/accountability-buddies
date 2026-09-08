// Every screen file imports `global.css` so NativeWind picks the file up. Jest
// has no CSS transform — and babel.config.js drops the NativeWind preset under
// NODE_ENV=test anyway — so the import resolves to nothing here. Without this
// the raw `@tailwind base;` reaches the JS parser and the suite dies on the
// screen's first line.
module.exports = {};
