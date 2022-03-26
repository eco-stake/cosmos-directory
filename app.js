import Koa from "koa";
import Subdomain from 'koa-subdomain';
import cors from "@koa/cors";
import { createClient } from 'redis';
import httpProxy from 'http-proxy';
import ChainRegistry from './chainRegistry/chainRegistry.js';
import ChainRegistryController from './chainRegistry/chainRegistryController.js'
import ProxyController from './proxy/proxyController.js'
import StatusController from './status/statusController.js'

const { createProxyServer } = httpProxy;

(async () => {
  const REDIS_HOST = process.env.REDIS_HOST || 'redis'
  const REDIS_PORT = process.env.REDIS_PORT || 6379

  const client = createClient({
    url: `redis://${REDIS_HOST}:${REDIS_PORT}`
  });
  client.on('error', (err) => console.log('Redis Client Error', err));
  await client.connect();

  const registry = ChainRegistry(client)

  const port = process.env.PORT || 3000;
  const app = new Koa();
  const subdomain = new Subdomain();

  app.use(cors());

  const proxy = createProxyServer()

  proxy.on('proxyRes', (proxyRes, req, res) => {
    var body = [];
    proxyRes.on('data', function (chunk) {
      body.push(chunk);
    });

    proxyRes.on('end', function () {
      res.rawBody = Buffer.concat(body).toString()
    });
  })

  proxy.on('error', (err, req, res) => {
    res.writeHead(500, {
      'Content-Type': 'text/plain'
    });
    res.end('Something went wrong: ' + err.message);
  })

  const proxyController = ProxyController(client, registry, proxy)
  subdomain.use('rest', proxyController.routes('rest'));
  subdomain.use('rpc', proxyController.routes('rpc'));

  subdomain.use('registry', ChainRegistryController(registry).routes());

  app.use(subdomain.routes());

  app.use(StatusController(client, registry).routes());

  app.listen(port);
  console.log(`listening on port ${port}`);
})();