import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  vite: () => ({
    // Chrome rejects the generated content script as non-UTF-8 on some
    // systems. Emit JavaScript as ASCII so the extension loader cannot fail
    // while decoding Korean text or emoji literals.
    esbuild: {
      charset: 'ascii',
    },
  }),
  manifest: {
    permissions: ['storage', '<all_urls>'],
    host_permissions: ['<all_urls>'],
    browser_specific_settings: {
      gecko: {
        id: 'carrot@rabbit-hole.local',
        data_collection_permissions: {
          required: ['none'],
          optional: [],
        },
      },
    },
  },
});
