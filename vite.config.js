import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import cloudflareTunnel from 'vite-plugin-cloudflare-tunnel';

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

function redesignPlugin() {
  return {
    name: 'redesign-proxy',
    configureServer(server) {
      server.middlewares.use('/__redesign', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const { objectData, instruction } = JSON.parse(body);

            const fullPrompt = `You are a 3D object designer for a pirate sailing game built with Three.js.

Current object "${objectData.name}":
${JSON.stringify(objectData, null, 2)}

Redesign instruction: ${instruction}

Return ONLY valid JSON (no markdown fences, no explanation) matching this schema:
{"children":[{"name":"part name","geometry":{"type":"BoxGeometry","args":[w,h,d]},"material":{"color":"#hex","metalness":0.3,"roughness":0.7},"position":[x,y,z],"rotation":[x,y,z],"scale":[1,1,1]}]}

Geometry types: BoxGeometry(w,h,d), SphereGeometry(r,wSeg,hSeg), CylinderGeometry(rTop,rBot,h,rSeg), ConeGeometry(r,h,rSeg), TorusGeometry(r,tube,rSeg,tSeg), PlaneGeometry(w,h).
Rules: ONLY JSON, same scale as original, creative, pirate ship colors, radians for rotation.`;

            console.log(`\n  Redesign request: "${instruction}" for ${objectData.name}`);

            // Use SSE to stream progress to the browser
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
            send('status', { message: 'Starting Claude Code...' });

            const proc = spawn('claude', [
              '-p', fullPrompt,
              '--output-format', 'stream-json',
              '--verbose',
            ], { stdio: ['inherit', 'pipe', 'pipe'] });

            let fullOutput = '';
            let charCount = 0;
            proc.stdout.on('data', (d) => {
              const chunk = d.toString();
              fullOutput += chunk;
              // Parse stream-json lines for progress
              for (const line of chunk.split('\n')) {
                if (!line.trim()) continue;
                try {
                  const evt = JSON.parse(line);
                  if (evt.type === 'assistant' && evt.message?.content) {
                    for (const block of evt.message.content) {
                      if (block.type === 'text' && block.text) {
                        charCount += block.text.length;
                        send('status', { message: `Claude generating... (${charCount} chars)` });
                      }
                    }
                  } else if (evt.type === 'result') {
                    // Final result
                    const text = evt.result || '';
                    const jsonMatch = text.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                      const design = JSON.parse(jsonMatch[0]);
                      console.log(`  Redesign complete: ${design.children?.length || 0} parts\n`);
                      send('done', { ok: true, design });
                      res.end();
                      return;
                    }
                  }
                } catch {}
              }
            });

            proc.stderr.on('data', (d) => {
              const msg = d.toString().trim();
              if (msg) send('status', { message: msg.slice(0, 100) });
            });

            const timeout = setTimeout(() => {
              proc.kill();
              send('done', { ok: false, error: 'Claude Code timed out (120s)' });
              res.end();
            }, 120000);

            proc.on('close', (code) => {
              clearTimeout(timeout);
              if (res.writableEnded) return;

              if (code !== 0) {
                console.error('  Claude Code exited with code', code);
                send('done', { ok: false, error: `Claude Code exited with code ${code}` });
                res.end();
                return;
              }

              // Fallback: try to parse result from accumulated output
              const jsonMatch = fullOutput.match(/"result"\s*:\s*"((?:[^"\\]|\\.)*)"/);
              if (jsonMatch) {
                try {
                  const text = JSON.parse('"' + jsonMatch[1] + '"');
                  const designMatch = text.match(/\{[\s\S]*\}/);
                  if (designMatch) {
                    const design = JSON.parse(designMatch[0]);
                    console.log(`  Redesign complete (fallback): ${design.children?.length || 0} parts\n`);
                    send('done', { ok: true, design });
                    res.end();
                    return;
                  }
                } catch {}
              }

              console.error('  Could not parse Claude response');
              send('done', { ok: false, error: 'Could not parse design from Claude response' });
              res.end();
            });
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
  plugins: [perfReportPlugin(), musicSceneSavePlugin(), githubProxyPlugin(), redesignPlugin(), editorSavePlugin(), designerSavePlugin(), cloudflareTunnel()],
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
