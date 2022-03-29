import Router from 'koa-router';
import { renderJson } from '../utils.js';

const StatusController = (client, registry) => {
  const registryStatus = async () => {
    return {
      paths: await registry.paths()
    }
  }

  const chainStatus = async (chain) => {
    const apis = chain.apis
    return ['rpc', 'rest'].reduce(async (asyncSum, type) => {
      const sum = await asyncSum
      const available = await apis.bestAddress(type)
      sum.available = sum.available === false ? false : !!available
      sum[type] = {
        available: !!available,
        best: await apis.bestUrls(type),
        current: await apis.current(type)
      }
      return sum
    }, {})
  }

  function routes() {
    const router = new Router();

    router.get('/status', async (ctx, next) => {
      const status = await registryStatus()
      renderJson(ctx, status)
    });

    router.get('/:chain/status', async (ctx, next) => {
      const chain = await registry.getChain(ctx.params.chain)
      const status = chain && await chainStatus(chain)
      renderJson(ctx, status)
    });

    return router.routes()
  }
   
  return {
    routes
  }
}

export default StatusController