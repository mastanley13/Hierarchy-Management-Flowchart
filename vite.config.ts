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
        server.middlewares.use('/api/ghl/snapshot', async (req, res) => {
          try {
            const mod = await import('./api/ghl/snapshot.js');
            const handler = (mod as any).default || mod;

            // Shim Express-like helpers expected by the handler
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
              (req as any).query = Object.fromEntries(u.searchParams.entries());
            } catch {}

            await handler(req as any, r);
          } catch (err: any) {
            res.statusCode = 500;
            try { res.setHeader('Content-Type', 'application/json'); } catch {}
            res.end(JSON.stringify({ error: 'Dev snapshot failed', details: String(err?.message || err) }));
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
