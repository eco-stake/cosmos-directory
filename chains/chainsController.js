import Router from 'koa-router';
import { renderJson } from '../utils.js';

function ChainsController(registry) {
  async function chainResponse(chain, summarize) {
    const { chain_name, network_type, pretty_name, chain_id, status, explorers } = chain.chain;
    const baseAsset = chain.baseAsset
    const apis = await chain.apis()
    const { params, services, prices, assets } = chain
    const response = {
      name: chain_name,
      path: chain.path,
      chain_name, 
      network_type,
      pretty_name,
      chain_id,
      status,
      symbol: baseAsset?.symbol,
      display: baseAsset?.display?.denom,
      denom: baseAsset?.denom,
      decimals: baseAsset?.decimals,
      coingecko_id: baseAsset?.coingecko_id,
      image: baseAsset?.image,
      height: apis.bestHeight(),
      best_apis: {
        rest: apis.bestUrls('rest'),
        rpc: apis.bestUrls('rpc')
      },
      explorers,
      params,
      services,
      prices,
      assets
    };
    if (summarize) {
      return response
    } else {
      return { ...chain.chain, ...response }
    } 
  }

  async function repositoryResponse() {
    const repository = await registry.repository()
    const commit = await registry.commit()
    return {
      url: repository.url,
      branch: repository.branch,
      commit: commit.oid,
      timestamp: commit.commit.author.timestamp
    }
  }

  function routes() {
    const router = new Router();

    router.get('/', async (ctx, next) => {
      const chains = await registry.getChains()
      renderJson(ctx, {
        repository: await repositoryResponse(),
        chains: await Promise.all(chains.map(async chain => {
          return await chainResponse(chain, true);
        }))
      });
    });

    router.get('/:chain', async (ctx, next) => {
      const chain = await registry.getChain(ctx.params.chain);
      renderJson(ctx, chain && {
        repository: await repositoryResponse(),
        chain: await chainResponse(chain)
      });
    });

    router.get('/:chain/:dataset', async (ctx, next) => {
      const chain = await registry.getChain(ctx.params.chain);
      const dataset = ctx.params.dataset.replace(/\.[^.]*$/,'')
      renderJson(ctx, chain && chain.getDataset(dataset));
    });

    return router.routes();
  }

  return {
    routes
  };
}

export default ChainsController