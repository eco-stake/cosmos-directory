import Koa from "koa";
import Subdomain from 'koa-subdomain';
import cors from "@koa/cors";
import ChainRegistry from './chainRegistry/chainRegistry.js';
import ChainRegistryController from './chainRegistry/chainRegistryController.js'
import ProxyController from './proxy/proxyController.js'
import StatusController from './status/statusController.js'
import { redisClient } from "./redisClient.js";

(async () => {
  const client = await redisClient();

  const registry = ChainRegistry(client)

  const port = process.env.PORT || 3000;
  const app = new Koa();
  const subdomain = new Subdomain();

  app.use(cors());

  const proxyController = ProxyController(client, registry)
  subdomain.use('rest', proxyController.routes('rest'));
  subdomain.use('rpc', proxyController.routes('rpc'));

  subdomain.use('registry', ChainRegistryController(registry).routes());

  app.use(subdomain.routes());

  app.use(StatusController(client, registry).routes());

  app.listen(port);
  console.log(`listening on port ${port}`);
})();