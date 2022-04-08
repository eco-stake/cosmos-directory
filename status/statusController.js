import Router from 'koa-router';
import _ from 'lodash';
import { renderJson } from '../utils.js';

const StatusController = (client, registry) => {
  const registryStatus = async () => {
    const chains = await registry.getChains()
    return {
      chains: await Promise.all(chains.map(async chain => {
        const status = await chainStatus(chain)
        return _.pick(status, ['name', 'height', 'available', 'rpc.available', 'rpc.height', 'rpc.best', 'rest.available', 'rest.height', 'rest.best'])
      }))
    }
  }

  const chainStatus = async (chain) => {
    const apis = await chain.apis()
    const data = {
      name: chain.name,
      height: apis.bestHeight(),
    }
    return ['rpc', 'rest'].reduce((sum, type) => {
      const available = apis.bestAddress(type)
      sum.available = sum.available === false ? false : !!available
      sum[type] = {
        available: !!available,
        height: apis.bestHeight(type),
        best: apis.bestUrls(type),
        current: apis.health[type] || {}
      }
      return sum
    }, data)
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