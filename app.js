import Koa from "koa";
import Subdomain from 'koa-subdomain';
import cors from "@koa/cors";
import { createClient } from 'redis';
import ChainRegistry from './chainRegistry/chainRegistry.js';
import ChainRegistryController from './chainRegistry/chainRegistryController.js'
import ProxyController from './proxy/proxyController.js'
import StatusController from './status/statusController.js'

(async () => {
  const client = createClient({
    url: 'redis://redis:6379'
  });
  client.on('error', (err) => console.log('Redis Client Error', err));
  await client.connect();

  const registry = ChainRegistry(client)

  const port = process.env.PORT || 3000;
  const app = new Koa();
  const subdomain = new Subdomain();

  app.use(cors());

  const proxy = ProxyController(client, registry)
  subdomain.use('rest', proxy.proxy('rest'));
  subdomain.use('rpc', proxy.proxy('rpc'));

  subdomain.use('registry', ChainRegistryController(registry).routes());

  app.use(subdomain.routes());

  app.use(StatusController(client, registry).routes());

  app.listen(port);
  console.log(`listening on port ${port}`);
})();