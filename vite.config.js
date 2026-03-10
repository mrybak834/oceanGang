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
            const { sceneName, code } = JSON.parse(body || '{}');
            if (typeof sceneName !== 'string' || !sceneName || typeof code !== 'string') {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: false, error: 'Invalid payload' }));
              return;
            }

            const filePath = path.resolve('public/music-scene-overrides.json');
            let existing = {};
            if (fs.existsSync(filePath)) {
              existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            }
            existing[sceneName] = code;
            fs.writeFileSync(filePath, JSON.stringify(existing, null, 2) + '\n', 'utf-8');

            console.log(`\n  Music scene saved → ${sceneName} (${filePath})\n`);
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
  plugins: [perfReportPlugin(), musicSceneSavePlugin()],
  optimizeDeps: {
    force: true,
  },
});
