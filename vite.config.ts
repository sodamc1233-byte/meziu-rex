import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {build as esbuildBundle} from 'esbuild';
import fs from 'fs';
import path from 'path';
import {defineConfig, type Plugin, type ViteDevServer} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

const PORTABLE_ASSETS: Array<{publicPath: string; inlineKey: string; mime: string}> = [
  {publicPath: 'assets/aistudio/image_bfcdf26e.png', inlineKey: './assets/aistudio/image_bfcdf26e.png', mime: 'image/png'},
  {publicPath: 'assets/aistudio/image_d81caafc.png', inlineKey: './assets/aistudio/image_d81caafc.png', mime: 'image/png'},
  {publicPath: 'assets/aistudio/image_d53618c1.png', inlineKey: './assets/aistudio/image_d53618c1.png', mime: 'image/png'},
  {publicPath: 'assets/aistudio/image_96ebf6d7.png', inlineKey: './assets/aistudio/image_96ebf6d7.png', mime: 'image/png'},
  {publicPath: 'assets/aistudio/tiktok_video.mp4_9e7a66e8.mp3', inlineKey: './assets/aistudio/tiktok_video.mp4_9e7a66e8.mp3', mime: 'audio/mpeg'},
];

function buildInlineAssetScript(rootDir: string): string {
  const map: Record<string, string> = {};
  for (const item of PORTABLE_ASSETS) {
    const absPath = path.join(rootDir, 'public', item.publicPath);
    if (fs.existsSync(absPath)) {
      const b64 = fs.readFileSync(absPath).toString('base64');
      map[item.inlineKey] = `data:${item.mime};base64,${b64}`;
    }
  }
  return `window.__INLINE_ASSETS__=${JSON.stringify(map)};`;
}

async function generatePortableHtml(rootDir: string, cssText: string): Promise<string> {
  const jsResult = await esbuildBundle({
    entryPoints: [path.resolve(rootDir, 'src/main.tsx')],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: ['es2020'],
    jsx: 'automatic',
    minify: true,
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    loader: {
      '.css': 'empty',
    },
  });

  const bundledJs = (jsResult.outputFiles?.[0]?.text ?? '').replace(/<\/script>/gi, '<\\/script>');
  const inlineAssetsJs = buildInlineAssetScript(rootDir).replace(/<\/script>/gi, '<\\/script>');
  const iconSvgPath = path.resolve(rootDir, 'public/icon.svg');
  const iconHref = fs.existsSync(iconSvgPath)
    ? `data:image/svg+xml;base64,${fs.readFileSync(iconSvgPath).toString('base64')}`
    : '';
  const appleIconPath = path.resolve(rootDir, 'public/apple-touch-icon.png');
  const appleIconHref = fs.existsSync(appleIconPath)
    ? `data:image/png;base64,${fs.readFileSync(appleIconPath).toString('base64')}`
    : '';

  return `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <title>Meziu Rex | Nekame</title>
    <meta name="description" content="Game hành động giải đố 2.5D Meziu Rex Level 1 phát hành bởi Nekame." />
    ${iconHref ? `<link rel="icon" type="image/svg+xml" href="${iconHref}" />` : ''}
    ${appleIconHref ? `<link rel="apple-touch-icon" href="${appleIconHref}" />` : ''}
    <style>${cssText}</style>
  </head>
  <body data-state="title">
    <div id="root"></div>
    <script>${inlineAssetsJs}</script>
    <script>${bundledJs}</script>
  </body>
</html>`;
}

function readDistCss(rootDir: string): string {
  const assetsDir = path.resolve(rootDir, 'dist/assets');
  if (!fs.existsSync(assetsDir)) return '';
  return fs
    .readdirSync(assetsDir)
    .filter((file) => file.endsWith('.css'))
    .map((file) => fs.readFileSync(path.join(assetsDir, file), 'utf-8'))
    .join('\n');
}

function meziuPortableExportPlugin(rootDir: string): Plugin {
  let cachedDevHtml: string | null = null;

  return {
    name: 'meziu-portable-export',
    configureServer(server: ViteDevServer) {
      const servePortable = async (
        req: {url?: string},
        res: {statusCode: number; setHeader: (name: string, val: string) => void; end: (body: string) => void},
        next: (err?: Error) => void,
      ) => {
        try {
          let cssText = '';
          const transformed = await server.transformRequest('/src/index.css?direct');
          if (transformed?.code) {
            cssText = transformed.code;
          } else {
            cssText = readDistCss(rootDir);
          }
          cachedDevHtml = await generatePortableHtml(rootDir, cssText);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          if ((req.url ?? '').includes('dl=1')) {
            res.setHeader('Content-Disposition', 'attachment; filename="Meziu-Rex-Nekame.html"');
          }
          res.end(cachedDevHtml);
        } catch (err) {
          if (cachedDevHtml) {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            if ((req.url ?? '').includes('dl=1')) {
              res.setHeader('Content-Disposition', 'attachment; filename="Meziu-Rex-Nekame.html"');
            }
            res.end(cachedDevHtml);
            return;
          }
          next(err as Error);
        }
      };

      server.middlewares.use('/Meziu-Rex-Nekame.html', servePortable);
      server.middlewares.use('/meziu-rex-level1-offline.html', servePortable);
    },
    async closeBundle() {
      const distDir = path.resolve(rootDir, 'dist');
      if (!fs.existsSync(distDir)) return;
      const cssText = readDistCss(rootDir);
      const html = await generatePortableHtml(rootDir, cssText);
      fs.writeFileSync(path.join(distDir, 'Meziu-Rex-Nekame.html'), html, 'utf-8');
      fs.writeFileSync(path.join(distDir, 'meziu-rex-level1-offline.html'), html, 'utf-8');
    },
  };
}

export default defineConfig(() => {
  return {
    base: './',
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        manifestFilename: 'manifest.json',
        includeAssets: ['icon.svg', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png', 'pwa-maskable-512x512.png'],
        manifest: {
          id: './',
          name: 'Meziu Rex — Level 1 | Nekame',
          short_name: 'Meziu Rex',
          description: 'Game hành động giải đố 2.5D Meziu Rex Level 1 phát hành bởi Nekame.',
          theme_color: '#1f251e',
          background_color: '#1f251e',
          display: 'standalone',
          orientation: 'landscape',
          start_url: './',
          scope: './',
          icons: [
            {
              src: './pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: './pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: './pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,mp3,woff,woff2}'],
          globIgnores: ['**/Meziu-Rex-Nekame.html', '**/meziu-rex-level1-offline.html'],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
      meziuPortableExportPlugin(__dirname),
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
