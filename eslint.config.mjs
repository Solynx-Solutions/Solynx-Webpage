import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['digital-media-tech/menu.js', 'digital-media-tech/native-attribution-bridge.js'],
    languageOptions: { globals: globals.browser }
  },
  {
    files: ['api/digital-media-lead.js'],
    languageOptions: { globals: globals.node, sourceType: 'commonjs' }
  }
];
