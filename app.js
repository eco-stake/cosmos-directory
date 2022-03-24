import Koa from "koa";
import Subdomain from 'koa-subdomain';
import cors from "@koa/cors";
import { join } from 'path';
import { createClient } from 'redis';
import ChainRegistry from './chainRegistry.js';
import Registry from './registry/index.js'
import Proxy from './proxy/index.js'
import Status from './status/index.js'

(async () => {
  const dir = join(process.cwd(), '../chain-registry')
  const url = process.env.REGISTRY_URL
  const branch = process.env.REGISTRY_BRANCH
  const refreshSeconds = parseInt(process.env.REGISTRY_REFRESH || 1800)
  const REGISTRY_REFRESH_INTERVAL = 1000 * refreshSeconds

  console.log("Using config:", {
    dir,
    url,
    branch,
    refreshSeconds
  })

  const registry = ChainRegistry(dir, url, branch)

  const client = createClient({
    url: 'redis://redis:6379'
  });
  client.on('error', (err) => console.log('Redis Client Error', err));
  await client.connect();

  await registry.refresh()
  setInterval(() => registry.refresh(), REGISTRY_REFRESH_INTERVAL)

  const port = process.env.PORT || 3000;
  const app = new Koa();
  const subdomain = new Subdomain();

  app.use(cors());

  const proxy = Proxy(client, registry)
  subdomain.use('rest', proxy.proxy('rest'));
  subdomain.use('rpc', proxy.proxy('rpc'));

  subdomain.use('registry', Registry(registry).routes());

  app.use(subdomain.routes());

  app.use(Status(client, registry).routes());

  app.listen(port);
  console.log(`listening on port ${port}`);
})();