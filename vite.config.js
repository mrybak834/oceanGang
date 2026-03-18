import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn, execSync } from 'child_process';
import net from 'net';
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

// editorSavePlugin and designerSavePlugin removed — state now lives in SpacetimeDB

// ─── SpacetimeDB Plugin ───
// Automatically starts a local SpacetimeDB server (via CLI or Docker), publishes
// the game module, and generates client bindings so multiplayer works with `npm run dev`.
function spacetimePlugin() {
  let serverProc = null;
  let usingDocker = false;
  const CONTAINER_NAME = 'ocean-gang-stdb';
  const SPACETIME_PORT = 3000;
  const SERVER_MODULE_PATH = path.resolve(__dirname, 'server');
  const BINDINGS_OUT = path.resolve(__dirname, 'src/module_bindings');
  const DB_NAME = 'ocean-gang';
  const DOCKER_IMAGE = 'clockworklabs/spacetime';

  function isPortOpen(port) {
    return new Promise((resolve) => {
      const sock = net.createConnection({ port, host: '127.0.0.1' }, () => {
        sock.destroy();
        resolve(true);
      });
      sock.on('error', () => resolve(false));
    });
  }

  async function waitForPort(port, timeoutMs = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (await isPortOpen(port)) return true;
      await new Promise(r => setTimeout(r, 500));
    }
    return false;
  }

  // spacetime CLI may be in ~/.local/bin which isn't in Node's default PATH
  const SPACETIME_BIN = (() => {
    const candidates = [
      'spacetime',
      path.join(process.env.HOME || '', '.local', 'bin', 'spacetime'),
      path.join(process.env.HOME || '', '.spacetime', 'bin', 'spacetime'),
    ];
    for (const bin of candidates) {
      try {
        // Use --help since `spacetime version` is a subcommand group (exits non-zero)
        execSync(`"${bin}" --help`, { stdio: 'pipe' });
        return bin;
      } catch {
        // Also check if the binary simply exists and is executable
        try {
          if (fs.existsSync(bin)) return bin;
        } catch {}
      }
    }
    return null;
  })();

  function hasCli() {
    return SPACETIME_BIN !== null;
  }

  function hasDocker() {
    try {
      execSync('docker info', { stdio: 'pipe', timeout: 5000 });
      return true;
    } catch { return false; }
  }

  // Run a spacetime CLI command — via native CLI or docker exec
  function stCmd(args, opts = {}) {
    if (usingDocker) {
      return execSync(`docker exec ${CONTAINER_NAME} spacetime ${args}`, { stdio: 'pipe', ...opts });
    }
    return execSync(`"${SPACETIME_BIN}" ${args}`, { stdio: 'pipe', ...opts });
  }

  return {
    name: 'spacetime',
    async configureServer(server) {
      const cliAvailable = hasCli();
      const dockerAvailable = !cliAvailable && hasDocker();

      if (!cliAvailable && !dockerAvailable) {
        console.log('\n  ⚠  SpacetimeDB multiplayer disabled (no CLI or Docker found).');
        console.log('  Install CLI: curl -sSf https://install.spacetimedb.com | sh');
        console.log('  Or install Docker: https://docker.com\n');
        return;
      }

      usingDocker = !cliAvailable;
      const mode = usingDocker ? 'Docker' : 'CLI';
      console.log(`\n  SpacetimeDB multiplayer starting (${mode})...`);

      // ── Start server ──
      const alreadyRunning = await isPortOpen(SPACETIME_PORT);
      if (!alreadyRunning) {
        if (usingDocker) {
          // Remove stale container if it exists
          try { execSync(`docker rm -f ${CONTAINER_NAME}`, { stdio: 'pipe' }); } catch {}

          console.log('  Starting SpacetimeDB Docker container (first run may pull image)...');
          execSync([
            'docker', 'run', '-d',
            '--name', CONTAINER_NAME,
            '-p', `${SPACETIME_PORT}:${SPACETIME_PORT}`,
            '-v', `${SERVER_MODULE_PATH}:/module`,
            '-v', `${BINDINGS_OUT}:/bindings`,
            DOCKER_IMAGE, 'start',
          ].join(' '), { stdio: 'pipe' });
        } else {
          console.log('  Starting SpacetimeDB server...');
          serverProc = spawn(SPACETIME_BIN, ['start'], {
            stdio: ['ignore', 'pipe', 'pipe'],
          });
          serverProc.stderr.on('data', (d) => {
            const msg = d.toString().trim();
            if (msg && !msg.includes('INFO')) console.log('  [spacetime]', msg);
          });
        }

        const ready = await waitForPort(SPACETIME_PORT);
        if (!ready) {
          console.error('  SpacetimeDB did not start in time. Multiplayer disabled.\n');
          if (usingDocker) {
            try { execSync(`docker rm -f ${CONTAINER_NAME}`, { stdio: 'pipe' }); } catch {}
          } else if (serverProc) {
            serverProc.kill();
          }
          return;
        }
        console.log('  SpacetimeDB running on port', SPACETIME_PORT);
      } else {
        console.log('  SpacetimeDB already running on port', SPACETIME_PORT);
        // If Docker container exists, use docker exec; otherwise assume CLI
        if (usingDocker) {
          try {
            const running = execSync(`docker ps --filter name=${CONTAINER_NAME} --format "{{.Names}}"`, { stdio: 'pipe' });
            if (running.toString().trim() !== CONTAINER_NAME) {
              usingDocker = false; // Port open but not our container — someone else started it
            }
          } catch {}
        }
      }

      // ── Publish server module ──
      // Run from server/ dir so spacetime.json config is found automatically
      const cwd = SERVER_MODULE_PATH;
      try {
        console.log('  Publishing server module...');
        stCmd(`publish -s local --delete-data=on-conflict --yes ${DB_NAME}`, { cwd });
        console.log('  Module published as "' + DB_NAME + '"');
      } catch (err) {
        console.error('  Failed to publish:', (err.stderr || err.stdout || '').toString().trim());
      }

      // ── Generate client bindings ──
      try {
        fs.mkdirSync(BINDINGS_OUT, { recursive: true });
        console.log('  Generating client bindings...');
        stCmd(`generate --lang typescript --out-dir "${BINDINGS_OUT}" --yes`, { cwd });
        console.log('  Bindings generated at src/module_bindings/\n');
      } catch (err) {
        console.error('  Failed to generate bindings:', (err.stderr || '').toString().trim());
      }

      // ── Cleanup on shutdown ──
      const cleanup = () => {
        if (usingDocker) {
          try { execSync(`docker rm -f ${CONTAINER_NAME}`, { stdio: 'pipe' }); } catch {}
        } else if (serverProc) {
          serverProc.kill();
          serverProc = null;
        }
      };
      server.httpServer?.on('close', cleanup);
      process.on('SIGINT', () => { cleanup(); process.exit(); });
      process.on('SIGTERM', () => { cleanup(); process.exit(); });
    },
  };
}

export default defineConfig({
  base: '/oceanGang/',
  plugins: [spacetimePlugin(), perfReportPlugin(), musicSceneSavePlugin(), githubProxyPlugin(), redesignPlugin(), cloudflareTunnel()],
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
