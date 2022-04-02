import Koa from "koa";
import Subdomain from 'koa-subdomain';
import cors from "@koa/cors";
import ChainRegistry from './chainRegistry/chainRegistry.js';
import ChainRegistryController from './chainRegistry/chainRegistryController.js'
import ValidatorRegistry from './validatorRegistry/validatorRegistry.js';
import ValidatorRegistryController from './validatorRegistry/validatorRegistryController.js'
import ProxyController from './proxy/proxyController.js'
import StatusController from './status/statusController.js'
import { redisClient } from "./redisClient.js";
import Router from "koa-router";

(async () => {
  const client = await redisClient();

  const port = process.env.PORT || 3000;
  const app = new Koa();
  const subdomain = new Subdomain();

  app.use(cors());

  const chainRegistry = ChainRegistry(client)
  const validatorRegistry = ValidatorRegistry(client)

  const proxyController = ProxyController(client, chainRegistry)
  subdomain.use('rest', proxyController.routes('rest'));
  subdomain.use('rpc', proxyController.routes('rpc'));

  subdomain.use('registry', ChainRegistryController(chainRegistry).routes()); // deprecated 
  subdomain.use('chains', ChainRegistryController(chainRegistry).routes());
  subdomain.use('validators', ValidatorRegistryController(validatorRegistry).routes());
  subdomain.use('status', StatusController(client, chainRegistry).routes());

  app.use(subdomain.routes());

  const router = new Router()
  router.get('/status', async (ctx, next) => {
    ctx.body = {
      status: 'ok'
    }
  });
  app.use(router.routes());

  app.listen(port);
  console.log(`listening on port ${port}`);
})();