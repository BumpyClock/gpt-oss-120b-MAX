const http = require('http');
const https = require('https');
const {loadEnvFile, OLLAMA_API_KEY} = require("./config");

loadEnvFile();
const PROXY_PORT = 3305;

const server = http.createServer((req, res) => {
  const targetUrl = new URL(req.url, 'https://ollama.com');

  console.log(`[${new Date().toISOString()}] ${req.method} ${targetUrl.href}`);

  const options = {
    hostname: targetUrl.hostname,
    port: targetUrl.port || 443,
    path: targetUrl.pathname + targetUrl.search,
    method: req.method,
    headers: {
      ...req.headers,
      'Authorization': `Bearer ${OLLAMA_API_KEY}`,
      'host': targetUrl.hostname
    }
  };

  const proxyReq = https.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('Proxy request error:', err);
    res.writeHead(500);
    res.end('Proxy Error');
  });

  req.pipe(proxyReq);
});

server.listen(PROXY_PORT, 'localhost', () => {
  console.log(`Ollama proxy server running on http://localhost:${PROXY_PORT}`);
  console.log(`Forward requests to: http://localhost:${PROXY_PORT}/api/*`);
  console.log(`Authorization header will be automatically added`);
});

process.on('SIGINT', () => {
  console.log('\nShutting down proxy server...');
  server.close(() => {
    process.exit(0);
  });
});

