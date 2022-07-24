import Router from 'koa-router';
import { renderJson } from '../utils.js';

function ChainsController(registry) {
  async function chainResponse(chain, summarize) {
    const { chain_name, network_type, pretty_name, chain_id, status } = chain.chain;
    const baseAsset = chain.baseAsset()
    const apis = await chain.apis()
    const params = chain.params
    const response = {
      name: chain_name,
      path: chain.path,
      chain_name, 
      network_type,
      pretty_name,
      chain_id,
      status,
      symbol: baseAsset && baseAsset.symbol,
      denom: baseAsset && baseAsset.denom,
      decimals: baseAsset && baseAsset.decimals,
      coingecko_id: baseAsset && baseAsset.coingecko_id,
      image: baseAsset && baseAsset.image,
      height: apis.bestHeight(),
      best_apis: {
        rest: apis.bestUrls('rest'),
        rpc: apis.bestUrls('rpc')
      },
      params: {
        authz: params?.authz,
        bonded_tokens: params?.bonded_tokens,
        total_supply: params?.total_supply,
        actual_block_time: params?.actual_block_time,
        calculated_apr: params?.calculated_apr,
      }
    };
    if (summarize) {
      return response
    } else {
      return { ...chain.chain, ...response, params: params, services: chain.services }
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