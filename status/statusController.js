import Router from 'koa-router';
import _ from 'lodash';
import { renderJson } from '../utils.js';

const StatusController = (client, registry) => {
  const registryStatus = async () => {
    const chains = await registry.getChains()
    return {
      chains: await Promise.all(chains.map(async chain => {
        const status = await chainStatus(chain)
        return _.pick(status, ['name', 'available', 'rpc.available', 'rpc.best', 'rest.available', 'rest.best'])
      }))
    }
  }

  const chainStatus = async (chain) => {
    const apis = chain.apis
    return ['rpc', 'rest'].reduce(async (asyncSum, type) => {
      const sum = await asyncSum
      const available = await apis.bestAddress(type)
      sum.name = chain.name
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

    router.get('/', async (ctx, next) => {
      const status = await registryStatus()
      renderJson(ctx, status)
    });

    router.get('/:chain', async (ctx, next) => {
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