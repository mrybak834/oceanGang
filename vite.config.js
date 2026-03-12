import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

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

export default defineConfig({
  base: '/oceanGang/',
  plugins: [perfReportPlugin(), musicSceneSavePlugin()],
  resolve: {
    dedupe: ['superdough', '@strudel/webaudio', '@strudel/repl'],
  },
  optimizeDeps: {
    exclude: ['superdough', '@strudel/webaudio', '@strudel/repl'],
  },
});
