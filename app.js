import Koa from "koa";
import Subdomain from 'koa-subdomain';
import cors from "@koa/cors";
import ChainRegistry from './chains/chainRegistry.js';
import ChainsController from './chains/chainsController.js'
import ValidatorRegistry from './validators/validatorRegistry.js';
import ValidatorsController from './validators/validatorsController.js'
import ProxyController from './proxy/proxyController.js'
import StatusController from './status/statusController.js'
import { redisClient } from "./redisClient.js";
import Router from "koa-router";
import Bugsnag from "@bugsnag/js"
import BugsnagPluginKoa from "@bugsnag/plugin-koa"

(async () => {
  const client = await redisClient();

  const port = process.env.PORT || 3000;
  const app = new Koa();
  const subdomain = new Subdomain();

  if(process.env.BUGSNAG_KEY){
    Bugsnag.start({
      apiKey: process.env.BUGSNAG_KEY,
      plugins: [BugsnagPluginKoa],
      enabledReleaseStages: ['production', 'staging'],
      releaseStage: process.env.NODE_ENV
    })
    const middleware = Bugsnag.getPlugin('koa')

    // This must be the first piece of middleware in the stack.
    // It can only capture errors in downstream middleware
    app.use(middleware.requestHandler)
    app.on('error', middleware.errorHandler)
  }

  app.use(cors());

  const chainRegistry = ChainRegistry(client)
  const validatorRegistry = ValidatorRegistry(client)

  const proxyController = ProxyController(client, chainRegistry)
  subdomain.use('rest', proxyController.routes('rest'));
  subdomain.use('rpc', proxyController.routes('rpc'));

  subdomain.use('chains', ChainsController(chainRegistry).routes());
  subdomain.use('validators', ValidatorsController(chainRegistry, validatorRegistry).routes());
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