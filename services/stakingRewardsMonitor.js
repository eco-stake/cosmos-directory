import PQueue from 'p-queue';
import got from 'got';
import _ from 'lodash'
import { bignumber, multiply, divide, format } from 'mathjs'
import { createAgent, debugLog, executeSync, timeStamp } from '../utils.js';

function StakingRewardsMonitor() {
  const agent = createAgent();
  const queue = new PQueue({ concurrency: 10 });
  const gotOpts = {
    timeout: { request: 5000 },
    retry: { limit: 3 },
    agent: agent
  }

  async function refreshStakingRewards(client, chains, key) {
    timeStamp('Running staking rewards update');
    try {
      const opts = {
        headers: {
          'Authorization': `${key}`
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
              await client.json.set('chains:' + chain.path, '$.services', {}, 'NX');
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
                    await client.json.set('validators:' + chain.path, `$.validators.${address}.services`, {}, 'NX');
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
        return queue.add(request, { identifier: chain.path });
      }));
      debugLog('Staking Rewards update complete')
    } catch (e) { timeStamp('Staking Rewards check failed', e.message) }
  }

  return {
    refreshStakingRewards
  }
}

export default StakingRewardsMonitor
