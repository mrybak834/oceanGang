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

export default defineConfig({
  plugins: [perfReportPlugin()],
  optimizeDeps: {
    force: true,
  },
});
