import Router from 'koa-router';
import { renderJson } from '../utils.js';

function ChainsController(registry) {
  async function chainResponse(chain, summarize) {
    const { chain_name, network_type, pretty_name, chain_id, status, explorers, keywords, codebase, bech32_prefix } = chain.chain;
    const baseAsset = chain.baseAsset
    const apis = await chain.apis()
    const { params, versions, services, prices, assets } = chain
    const response = {
      name: chain_name,
      path: chain.path,
      chain_name, 
      network_type,
      pretty_name,
      chain_id,
      status,
      bech32_prefix,
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
      proxy_status: {
        rest: !!apis.bestAddress('rest'),
        rpc: !!apis.bestAddress('rpc')
      },
      versions: {
        ...versions,
        application_version: versions?.application_version || codebase?.recommended_version,
        cosmos_sdk_version: versions?.cosmos_sdk_version || codebase?.cosmos_sdk_version,
        tendermint_version: versions?.tendermint_version || codebase?.tendermint_version,
        cosmwasm_version: codebase?.cosmwasm_version
      },
      cosmwasm_enabled: codebase?.cosmwasm_enabled,
      explorers,
      params,
      services,
      prices,
      assets,
      keywords
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