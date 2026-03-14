import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Dev-only plugin: receives perf report POSTs and writes them to disk
function perfReportPlugin() {
  return {
    name: 'perf-report',
    configureServer(server) {
      server.middlewares.use('/__perf_report', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          const filePath = path.resolve('perf-report.json');
          fs.writeFileSync(filePath, body, 'utf-8');
          console.log(`\n  Perf report saved → ${filePath}\n`);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, path: filePath }));
        });
      });
    },
  };
}

function musicSceneSavePlugin() {
  return {
    name: 'music-scene-save',
    configureServer(server) {
      server.middlewares.use('/__save_music_scene', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }

        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const payload = JSON.parse(body || '{}');
            if (!payload || typeof payload !== 'object') {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: false, error: 'Invalid payload' }));
              return;
            }
            const filePath = path.resolve('public/music-scene-overrides.json');
            const existing = fs.existsSync(filePath)
              ? JSON.parse(fs.readFileSync(filePath, 'utf-8'))
              : {};
            if (payload.mode === 'replace_all' && payload.data && typeof payload.data === 'object') {
              fs.writeFileSync(filePath, JSON.stringify(payload.data, null, 2) + '\n', 'utf-8');
            } else {
              const { sceneName, code } = payload;
              if (typeof sceneName !== 'string' || !sceneName || typeof code !== 'string') {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ ok: false, error: 'Invalid payload' }));
                return;
              }
              existing[sceneName] = code;
              fs.writeFileSync(filePath, JSON.stringify(existing, null, 2) + '\n', 'utf-8');
            }

            console.log(`\n  Music scene overrides saved → ${filePath}\n`);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, path: filePath }));
          } catch (err) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: err.message }));
          }
        });
      });
    },
  };
}

// Dev-only plugin: proxy GitHub pages with CSP headers stripped so they can be
// embedded in iframes. Used by the tickets roadmap tool.
function githubProxyPlugin() {
  return {
    name: 'github-proxy',
    configureServer(server) {
      // Proxy GitHub API calls (/_graphql, /_render, etc.) that the iframe's JS makes
      server.middlewares.use((req, res, next) => {
        if (!req.url.startsWith('/_graphql') && !req.url.startsWith('/_render')) {
          return next();
        }
        const target = 'https://github.com' + req.url;
        const headers = { 'User-Agent': 'Mozilla/5.0 (Macintosh) oceanGang-roadmap-proxy' };
        // Forward cookies/auth if present
        if (req.headers.cookie) headers['Cookie'] = req.headers.cookie;
        if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];

        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          try {
            const resp = await fetch(target, {
              method: req.method || 'GET',
              headers,
              body: body || undefined,
            });
            res.statusCode = resp.status;
            const ct = resp.headers.get('content-type');
            if (ct) res.setHeader('Content-Type', ct);
            res.end(await resp.text());
          } catch (err) {
            res.statusCode = 502;
            res.end('Proxy error: ' + err.message);
          }
        });
      });

      // Main page proxy
      server.middlewares.use('/__github_proxy', async (req, res) => {
        const url = new URL(req.url, 'http://localhost');
        const target = url.searchParams.get('url');
        if (!target || !target.startsWith('https://github.com/')) {
          res.statusCode = 400;
          res.end('Bad request: url param must start with https://github.com/');
          return;
        }
        try {
          const resp = await fetch(target, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh) oceanGang-roadmap-proxy' },
          });
          let html = await resp.text();
          // Kill GitHub's SPA/turbo navigation so links do full page loads through proxy
          html = html.replace(/<script[^>]*src="[^"]*(?:turbo|react-app|chunk)[^"]*"[^>]*><\/script>/gi, '');
          html = html.replace(/data-turbo="true"/g, 'data-turbo="false"');
          html = html.replace(/data-turbo-frame="[^"]*"/g, '');
          // Rewrite github.com links to go through the proxy
          html = html.replace(
            /href="(https:\/\/github\.com\/[^"]+)"/g,
            (_, ghUrl) => `href="/__github_proxy?url=${encodeURIComponent(ghUrl)}"`
          );
          html = html.replace(
            /href="(\/[^"]+)"/g,
            (_, ghPath) => `href="/__github_proxy?url=${encodeURIComponent('https://github.com' + ghPath)}"`
          );
          res.setHeader('Content-Type', resp.headers.get('content-type') || 'text/html');
          res.end(html);
        } catch (err) {
          res.statusCode = 502;
          res.end('Proxy error: ' + err.message);
        }
      });
    },
  };
}

function editorSavePlugin() {
  return {
    name: 'editor-save',
    configureServer(server) {
      server.middlewares.use('/__save_editor', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            const filePath = path.resolve('public/editorState.json');
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
            console.log(`\n  Editor state saved → ${filePath}\n`);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, path: filePath }));
          } catch (err) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: err.message }));
          }
        });
      });
    },
  };
}

function designerSavePlugin() {
  return {
    name: 'designer-save',
    configureServer(server) {
      server.middlewares.use('/__save_designer', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            const filePath = path.resolve('public/designerState.json');
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
            console.log(`\n  Designer state saved → ${filePath}\n`);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, path: filePath }));
          } catch (err) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: err.message }));
          }
        });
      });
    },
  };
}

export default defineConfig({
  base: '/oceanGang/',
  plugins: [perfReportPlugin(), musicSceneSavePlugin(), githubProxyPlugin(), editorSavePlugin(), designerSavePlugin()],
  resolve: {
    dedupe: ['superdough', '@strudel/webaudio', '@strudel/repl'],
  },
  optimizeDeps: {
    exclude: ['superdough', '@strudel/webaudio', '@strudel/repl'],
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        tickets: path.resolve(__dirname, 'tickets/index.html'),
      },
    },
  },
});
