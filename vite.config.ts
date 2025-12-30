import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    // Dev-only middleware to serve our serverless snapshot handler at /api/ghl/snapshot
    {
      name: 'ghl-dev-api',
      apply: 'serve',
      configureServer(server) {
        const runServerless = async (modulePath: string, req: any, res: any) => {
          const mod = await import(modulePath);
          const handler = (mod as any).default || mod;

          const r = res as any;
          if (typeof r.status !== 'function') {
            r.status = function (code: number) {
              this.statusCode = code;
              return this;
            };
          }
          if (typeof r.json !== 'function') {
            r.json = function (payload: any) {
              try { this.setHeader('Content-Type', 'application/json'); } catch {}
              this.end(JSON.stringify(payload));
              return this;
            };
          }
          // Populate req.query from the URL for compatibility
          try {
            const u = new URL(req.url!, 'http://localhost');
            req.query = Object.fromEntries(u.searchParams.entries());
          } catch {}

          await handler(req as any, r);
        };

        const readBody = async (req: any): Promise<string> => {
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }
          return Buffer.concat(chunks).toString('utf8');
        };

        server.middlewares.use('/api/ghl/snapshot', async (req, res) => {
          try {
            await runServerless('./api/ghl/snapshot.js', req as any, res as any);
          } catch (err: any) {
            res.statusCode = 500;
            try { res.setHeader('Content-Type', 'application/json'); } catch {}
            res.end(JSON.stringify({ error: 'Dev snapshot failed', details: String(err?.message || err) }));
          }
        });

        // Dev-only middleware to serve our serverless contact update handler at /api/ghl/update-upline-producer-id
        server.middlewares.use('/api/ghl/update-upline-producer-id', async (req, res) => {
          try {
            if (req.method && req.method !== 'POST' && req.method !== 'OPTIONS') {
              res.statusCode = 405;
              try { res.setHeader('Content-Type', 'application/json'); } catch {}
              res.end(JSON.stringify({ error: 'Method Not Allowed' }));
              return;
            }

            if (req.method === 'POST') {
              const bodyText = await readBody(req);
              (req as any).body = bodyText;
            }

            await runServerless('./api/ghl/update-upline-producer-id.js', req as any, res as any);
          } catch (err: any) {
            res.statusCode = 500;
            try { res.setHeader('Content-Type', 'application/json'); } catch {}
            res.end(JSON.stringify({ error: 'Dev update failed', details: String(err?.message || err) }));
          }
        });

        // Dev-only middleware for serverless SureLC contact fetcher (prevents /api proxy rewrite)
        server.middlewares.use('/api/surelc/producer', async (req, res) => {
          try {
            await runServerless('./api/surelc/producer.js', req as any, res as any);
          } catch (err: any) {
            res.statusCode = 500;
            try { res.setHeader('Content-Type', 'application/json'); } catch {}
            res.end(JSON.stringify({ error: 'Dev SureLC handler failed', details: String(err?.message || err) }));
          }
        });
      }
    }
  ],
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api': {
        target: 'https://surelc.surancebay.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/sbweb/ws'),
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            // Add CORS headers and handle authentication
            const auth = req.headers.authorization;
            if (auth) {
              proxyReq.setHeader('Authorization', auth);
            }
          });
          // Prevent browser basic-auth popups by stripping the challenge header in dev
          proxy.on('proxyRes', (proxyRes, req, res) => {
            const header = (proxyRes.headers as any)['www-authenticate'];
            if (header) {
              delete (proxyRes.headers as any)['www-authenticate'];
              // Also ensure not present on the outgoing response
              try { (res as any).removeHeader?.('www-authenticate'); } catch {}
            }
          });
        }
      }
    }
  }
})
