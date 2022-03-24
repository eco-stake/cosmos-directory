import Router from 'koa-router';
import ChainApis from '../chainApis.js';
import { renderJson } from '../utils.js';

const Status = (client, registry) => {
  const registryStatus = async () => {
    return {
      chains: registry.chainNames()
    }
  }

  const chainStatus = async (chain) => {
    const apis = ChainApis(client, chain.chainId, chain.apis)
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
      const chain = registry.getChain(ctx.params.chain)
      const status = await chainStatus(chain)
      renderJson(ctx, chain && status)
    });

    return router.routes()
  }
   
  return {
    routes
  }
}

export default Status