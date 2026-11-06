import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1500 },
  plugins: [{
    name: 'strip-static-preview',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        return ctx.server ? html : html.replace(/\s*<script type="importmap" data-static-preview>[\s\S]*?<\/script>/, '');
      }
    }
  }]
});
