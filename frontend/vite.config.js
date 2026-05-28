import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        terms: resolve(__dirname, 'terms.html'),
        omegleAlternative: resolve(__dirname, 'omegle-alternative/index.html'),
        randomVideoChat: resolve(__dirname, 'random-video-chat/index.html'),
        talkToStrangers: resolve(__dirname, 'talk-to-strangers/index.html'),
        freeChatOnline: resolve(__dirname, 'free-chat-online/index.html'),
        blog: resolve(__dirname, 'blog/index.html'),
        blogBestAlternatives: resolve(__dirname, 'blog/best-omegle-alternatives-2026.html'),
        blogIsSafe: resolve(__dirname, 'blog/is-omegle-safe.html'),
        blogRandomChatApps: resolve(__dirname, 'blog/random-chat-apps-adults.html'),
        blogSitesLikeOmetv: resolve(__dirname, 'blog/sites-like-ometv.html'),
      }
    }
  }
});
