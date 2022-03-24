import Router from 'koa-router';
import { renderJson } from '../utils.js';

const Registry = (registry) => {
  function summary(chain) {
    const { chain_name, network_type, pretty_name, chain_id } = chain.chain
    const baseAsset = chain.assets && chain.assets[0]
    return {
      directory: chain.directory,
      chain_name,
      network_type,
      pretty_name,
      chain_id,
      status: chain.status,
      symbol: baseAsset && baseAsset.symbol,
      coingecko_id: baseAsset && baseAsset.coingecko_id,
      image: baseAsset && baseAsset.image,
      apis: chain.apis
    }
  }

  function routes() {
    const router = new Router();

    router.get('/', (ctx, next) => {
      renderJson(ctx, registry.getChains().map(chain => {
        return  summary(chain)
      }))
    });

    router.get('/:chain', (ctx, next) => {
      const chain = registry.getChain(ctx.params.chain)
      renderJson(ctx, chain && summary(chain))
    });

    router.get('/:chain/chain', (ctx, next) => {
      const chain = registry.getChain(ctx.params.chain)
      renderJson(ctx, chain && chain.chain)
    });

    router.get('/:chain/assetlist', (ctx, next) => {
      const chain = registry.getChain(ctx.params.chain)
      renderJson(ctx, chain && chain.assetlist)
    });

    return router.routes()
  }
   
  return {
    routes
  }
}

export default Registry