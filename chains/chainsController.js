import Router from 'koa-router';
import { renderJson } from '../utils.js';

function ChainsController(registry) {
  function summary(chain) {
    const { chain_name, network_type, pretty_name, chain_id, status } = chain.chain;
    const baseAsset = chain.assets && chain.assets[0];
    return {
      name: chain_name,
      path: chain.path,
      chain_name, 
      network_type,
      pretty_name,
      chain_id,
      status,
      symbol: baseAsset && baseAsset.symbol,
      coingecko_id: baseAsset && baseAsset.coingecko_id,
      image: baseAsset && baseAsset.image,
      apis: chain.apis
    };
  }

  function routes() {
    const router = new Router();

    router.get('/', async (ctx, next) => {
      const repository = await registry.repository()
      const commit = await registry.commit()
      const chains = await registry.getChains()
      renderJson(ctx, {
        repository: {
          url: repository.url,
          branch: repository.branch,
          commit: commit.oid,
          timestamp: commit.commit.author.timestamp
        },
        chains: chains.map(chain => {
          return summary(chain);
        })
      });
    });

    router.get('/:chain', async (ctx, next) => {
      const chain = await registry.getChain(ctx.params.chain);
      renderJson(ctx, chain && summary(chain));
    });

    router.get('/:chain/:dataset', async (ctx, next) => {
      const chain = await registry.getChain(ctx.params.chain);
      let dataset = ctx.params.dataset.replace(/\.[^.]*$/,'')
      dataset = ['path'].includes(dataset) ? undefined : dataset
      renderJson(ctx, chain && dataset && chain.data[dataset]);
    });

    return router.routes();
  }

  return {
    routes
  };
}

export default ChainsController