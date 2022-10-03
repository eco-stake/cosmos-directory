import PQueue from 'p-queue';
import got from 'got';
import _ from 'lodash'
import { createAgent, debugLog, executeSync, timeStamp, getAllPages } from '../utils.js';

const VALIDATOR_THROTTLE = process.env.VALIDATOR_THROTTLE ?? 5000

function ServicesMonitor() {
  const agent = createAgent();
  const chainQueue = new PQueue({ concurrency: 20 });
  const serviceQueue = new PQueue({ concurrency: 10 });
  const gotOpts = {
    timeout: { request: 60000 },
    retry: { limit: 2 },
    agent: agent
  }

  async function refreshServices(client, chains, stakingRewardsKey) {
    timeStamp('Running services update');
    await refreshCoingecko(client, chains)
    if (stakingRewardsKey) {
      await refreshStakingRewards(client, chains, stakingRewardsKey)
    }
    await refreshDelegations(client, chains)
  }

  async function refreshDelegations(client, chains) {
    try {
      await Promise.all([...chains].map((chain) => {
        const request = async () => {
          try {
            const validators = await client.json.get('validators:' + chain.path, '$') || {}
            if(!validators?.validators) return

            const calls = Object.entries(validators.validators).map(([address, validator]) => {
              return async () => {
                try {
                  const apis = await chain.apis()
                  const height = apis.bestHeight('rest')
                  const url = apis.bestAddress('rest')
                  if(url){
                    const delegations = await getDelegationInfo(url, validator, chain)
                    await client.json.set('validators:' + chain.path, `$.validators.${address}.delegations`, delegations)
                    const slashes = chain.config.monitor.slashes ? (await getSlashes(url, height, validator.operator_address)) : null
                    await client.json.set('validators:' + chain.path, `$.validators.${address}.slashes`, slashes)

                    // throttle as these requests are heavy
                    await new Promise(r => setTimeout(r, VALIDATOR_THROTTLE));
                  }else{
                    timeStamp(chain.path, address, 'Validator delegations no API URL')
                  }
                } catch (error) { debugLog(chain.path, address, 'Validator delegations update failed', error.message) }
              }
            })
            await executeSync(calls, 1)
            debugLog(chain.path, 'Validator delegations update complete')
          } catch (e) { timeStamp(chain.path, 'Validator delegations update failed', e.message) }
        };
        return chainQueue.add(request, { identifier: chain.path });
      }));
      debugLog('Validator delegations update complete')
    } catch (e) { timeStamp('Validator delegations update failed', e.message) }
  }

  const getDelegationInfo = async (url, validator, chain) => {
    try {
      let count
      if(chain.config.monitor.delegations){
        const searchParams = new URLSearchParams();
        searchParams.append("pagination.limit", 1);
        searchParams.append("pagination.count_total", true);
        const response = await got.get(`${url}cosmos/staking/v1beta1/validators/${validator.operator_address}/delegations?${searchParams.toString()}`, gotOpts);
        const data = JSON.parse(response.body)
        count = data.pagination?.total
        count = count ? parseInt(count) : validator.delegations?.total_count
      }
      return {
        total_tokens: validator.tokens,
        total_count: count
      }
    } catch (error) {
      if (error.response?.statusCode === 404) {
        return {
          total_tokens: validator.tokens,
          total_count: validator.delegations?.total_count
        }
      }
      throw error
    }
  }

  const getSlashes = async (url, height, operatorAddress) => {
    const pages = await getAllPages((nextKey) => {
      const searchParams = new URLSearchParams();
      searchParams.append("pagination.limit", 100);
      searchParams.append("ending_height", height);
      if (nextKey) searchParams.append("pagination.key", nextKey);
      return got.get(`${url}cosmos/distribution/v1beta1/validators/${operatorAddress}/slashes?` + searchParams.toString(), gotOpts).catch(error => {
        throw error
      });
    })
    return pages.map((el) => el.slashes).flat()
  }

  async function refreshCoingecko(client, chains) {
    try {

      await Promise.all([...chains].map((chain) => {
        const request = async () => {
          try {
            const assets = chain.assets?.filter(el => el.coingecko_id)
            if(!assets || !assets.length) return

            const coingeckoIds = assets.map(el => el.coingecko_id).join(',')
            const prices = await got.get(`https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoIds}&vs_currencies=usd`, gotOpts).json()
            const data = assets.reduce((sum, asset) => {
              const price = prices[asset.coingecko_id]
              if(price?.usd && asset.display?.denom) sum[asset.display.denom] = price
              return sum
            }, {})
            await client.json.del('chains:' + chain.path, '$.services.coingecko'); // clean up
            await client.json.set('chains:' + chain.path, '$', {}, { NX: true });
            await client.json.set('chains:' + chain.path, '$.prices', {}, { NX: true });
            await client.json.set('chains:' + chain.path, '$.prices.coingecko', { ...data });
            debugLog(chain.path, 'Coingecko update complete')
          } catch (e) { timeStamp(chain.path, 'Coingecko check failed', e.message) }
        };
        return serviceQueue.add(request, { identifier: chain.path });
      }));
      debugLog('Coingecko update complete')
    } catch (e) { timeStamp('Coingecko check failed', e.message) }
  }

  async function refreshStakingRewards(client, chains, stakingRewardsKey) {
    try {
      const opts = {
        headers: {
          'Authorization': `${stakingRewardsKey}`
        },
        ...gotOpts
      }
      const assets = await got.get('https://api-beta.stakingrewards.com/v1/list/assets', opts).json()
      const providers = await got.get('https://api-beta.stakingrewards.com/v1/list/providers', opts).json()

      await Promise.all([...chains].map((chain) => {
        const request = async () => {
          try {
            const asset = assets.find(el => chain.symbol && el.symbol === chain.symbol.toUpperCase())
            if (asset) {
              await client.json.set('chains:' + chain.path, '$', {}, { NX: true });
              await client.json.set('chains:' + chain.path, '$.services', {}, { NX: true });
              await client.json.set('chains:' + chain.path, '$.services.staking_rewards', asset);
              const assetProviders = await got.get(`https://api-beta.stakingrewards.com/v1/assets/providers/${asset.slug}`, opts).json()
              const validators = await client.json.get('validators:' + chain.path, '$') || {}
              const calls = Object.entries(validators.validators).map(([address, validator]) => {
                return async () => {
                  const assetProvider = assetProviders.providers.find(provider => {
                    return provider.staking.find(el => el.address === address)
                  })
                  if (assetProvider) {
                    const provider = providers.find(el => el.name === assetProvider.name)
                    await client.json.set('validators:' + chain.path, `$.validators.${address}.services`, {}, { NX: true });
                    await client.json.set('validators:' + chain.path, `$.validators.${address}.services.staking_rewards`, {
                      name: assetProvider.name,
                      verified: assetProvider.isVerified,
                      slug: provider.slug
                    });
                  }
                }
              })
              await executeSync(calls, 20)
              debugLog(chain.path, 'Staking Rewards update complete')
            } else {
              debugLog(chain.path, 'Staking Rewards asset not found')
            }
          } catch (e) { timeStamp(chain.path, 'Staking Rewards check failed', e.message) }
        };
        return serviceQueue.add(request, { identifier: chain.path });
      }));
      debugLog('Staking Rewards update complete')
    } catch (e) { timeStamp('Staking Rewards check failed', e.message) }
  }

  return {
    refreshServices
  }
}

export default ServicesMonitor
