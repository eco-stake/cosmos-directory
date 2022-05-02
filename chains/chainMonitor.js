import PQueue from 'p-queue';
import got from 'got';
import _ from 'lodash'
import Agent from 'agentkeepalive'
import { bignumber, divide, format } from 'mathjs'
import { debugLog, timeStamp } from '../utils.js';

function ChainMonitor() {
  const agent = {
    http: new Agent({ maxSockets: 20 }),
    https: new Agent.HttpsAgent({ maxSockets: 20 })
  }
  const queue = new PQueue({ concurrency: 10 });

  async function refreshChains(client, chains) {
    timeStamp('Running chain update');
    await Promise.all([...chains].map((chain) => {
      const request = async () => {
        const apis = await chain.apis('rest')
        const restUrl = apis.bestAddress('rest')
        if (!restUrl) return timeStamp(chain.path, 'No API URL')

        const current = await client.json.get('chains:' + chain.path, '$') || {}

        let chainParams = await getChainParams(restUrl, chain, current.params || {});

        await client.json.set('chains:' + chain.path, '$', {
          chainId: chain.chainId,
          lastUpdated: Date.now(),
          params: chainParams || current.params
        });
        debugLog(chain.path, 'Chain update complete')
      };
      return queue.add(request, { identifier: chain.path });
    }));
    debugLog('Chain update complete')
  }

  async function getChainParams(restUrl, chain, current) {
    const { denom } = chain
    try {
      const authzParams = await getAuthzParams(restUrl)
      const blockParams = await getBlockParams(restUrl, chain)
      const stakingParams = await getStakingParams(restUrl, chain)
      let supplyParams, mintParams
      if (denom) {
        supplyParams = await getSupplyParams(restUrl, chain, stakingParams?.bondedTokens)
        mintParams = await getMintParams(restUrl, chain, supplyParams?.totalSupply, supplyParams?.bondedRatio, blockParams?.actualBlocksPerYear)
      }
      const data = { ...current, ...authzParams, ...blockParams, ...stakingParams, ...supplyParams, ...mintParams }
      return _.mapKeys({
        ...data,
        bondedTokens: data.bondedTokens && formatNumber(data.bondedTokens),
        totalSupply: data.totalSupply && formatNumber(data.totalSupply)
      }, (_value, key) => _.snakeCase(key))
    } catch (error) {
      timeStamp(chain.path, 'Update failed', error.message)
    }
  }

  async function getAuthzParams(restUrl) {
    try {
      await got.get(restUrl + 'cosmos/authz/v1beta1/grants', {
        timeout: { request: 5000 },
        retry: { limit: 3 },
        agent: agent
      })
    } catch (error) {
      if (error.response?.statusCode === 400) {
        return { authz: true }
      } else if (error.response?.statusCode === 501) {
        return { authz: false }
      }
    }
  }

  async function getBlockParams(restUrl, chain) {
    try {
      const currentBlock = await got.get(restUrl + 'blocks/latest', {
        timeout: { request: 5000 },
        retry: { limit: 3 },
        agent: agent
      }).json()
      const currentBlockTime = new Date(currentBlock.block.header.time) / 1000
      const currentBlockHeight = currentBlock.block.header.height
      const prevBlock = await got.get(restUrl + 'blocks/' + (currentBlockHeight - 100), {
        timeout: { request: 5000 },
        retry: { limit: 3 },
        agent: agent
      }).json()
      const prevBlockTime = new Date(prevBlock.block.header.time) / 1000
      const prevBlockHeight = prevBlock.block.header.height
      const actualBlockTime = (currentBlockTime - prevBlockTime) / (currentBlockHeight - prevBlockHeight)
      const actualBlocksPerYear = (365 * 24 * 60 * 60) / actualBlockTime
      return {
        actualBlockTime,
        actualBlocksPerYear
      }
    } catch (e) { timeStamp(chain.path, 'Block check failed', e.message) }
  }

  async function getStakingParams(restUrl, chain) {
    try {
      const staking = await got.get(restUrl + 'cosmos/staking/v1beta1/params', {
        timeout: { request: 5000 },
        retry: { limit: 3 },
        agent: agent
      }).json();
      const unbondingTime = parseInt(staking.params.unbonding_time.replace('s', ''))
      const maxValidators = staking.params.max_validators
      const pool = await got.get(restUrl + 'cosmos/staking/v1beta1/pool', {
        timeout: { request: 5000 },
        retry: { limit: 3 },
        agent: agent
      }).json();
      const bondedTokens = bignumber(pool.pool.bonded_tokens);
      return {
        unbondingTime,
        maxValidators,
        bondedTokens
      }
    } catch (e) { timeStamp(chain.path, 'Staking check failed', e.message) }
  }

  async function getSupplyParams(restUrl, chain, bondedTokens) {
    try {
      const { denom } = chain
      const supply = await got.get(restUrl + 'cosmos/bank/v1beta1/supply/' + denom, {
        timeout: { request: 5000 },
        retry: { limit: 3 },
        agent: agent
      }).json();
      const totalSupply = bignumber(supply.amount.amount);
      const bondedRatio = bondedTokens && parseFloat(divide(bondedTokens, totalSupply))
      return {
        totalSupply,
        bondedRatio
      }
    } catch (e) { timeStamp(chain.path, 'Supply check failed', e.message) }
  }

  async function getMintParams(restUrl, chain, totalSupply, bondedRatio, actualBlocksPerYear) {
    const path = chain.path
    try {
      if (path === 'osmosis') {
        return await getOsmosisParams(restUrl, totalSupply, bondedRatio)
      } else if (path === 'sifchain') {
        const aprRequest = await got.get(
          "https://data.sifchain.finance/beta/validator/stakingRewards", {
          timeout: { request: 5000 },
          retry: { limit: 3 },
          agent: agent
        }
        ).json();
        return {
          calculatedApr: aprRequest.rate
        }
      } else {
        const mint = await got.get(restUrl + 'cosmos/mint/v1beta1/params', {
          timeout: { request: 5000 },
          retry: { limit: 3 },
          agent: agent
        }).json();
        const blocksPerYear = parseInt(mint.params.blocks_per_year)
        const blockTime = (365 * 24 * 60 * 60) / blocksPerYear
        const distribution = await got.get(restUrl + 'cosmos/distribution/v1beta1/params', {
          timeout: { request: 5000 },
          retry: { limit: 3 },
          agent: agent
        }).json();
        const communityTax = parseFloat(distribution.params.community_tax)
        const req = await got.get(restUrl + 'cosmos/mint/v1beta1/inflation', {
          timeout: { request: 5000 },
          retry: { limit: 3 },
          agent: agent
        }).json()
        const baseInflation = parseFloat(req.inflation);
        let estimatedApr, calculatedApr
        if (baseInflation > 0 && bondedRatio) {
          estimatedApr = baseInflation > 0 ? ((baseInflation / bondedRatio) - communityTax) : 0
          calculatedApr = estimatedApr * (actualBlocksPerYear / blocksPerYear)
        }
        return {
          blocksPerYear,
          blockTime,
          communityTax,
          baseInflation,
          estimatedApr,
          calculatedApr
        }
      }
    } catch (e) { timeStamp(path, 'Mint check failed', e.message) }
  }

  async function getOsmosisParams(restUrl, totalSupply, bondedRatio) {
    const mintParams = await got.get(
      restUrl + "/osmosis/mint/v1beta1/params", {
      timeout: { request: 5000 },
      retry: { limit: 3 },
      agent: agent
    }
    ).json();
    const osmosisEpochs = await got.get(
      restUrl + "/osmosis/epochs/v1beta1/epochs", {
      timeout: { request: 5000 },
      retry: { limit: 3 },
      agent: agent
    }
    ).json();
    const epochProvisions = await got.get(
      restUrl + "/osmosis/mint/v1beta1/epoch_provisions", {
      timeout: { request: 5000 },
      retry: { limit: 3 },
      agent: agent
    }
    ).json();
    const { params } = mintParams;
    const { epochs } = osmosisEpochs;
    const { epoch_provisions } = epochProvisions;
    const mintingEpochProvision = parseFloat(params.distribution_proportions.staking) * epoch_provisions;
    const epochDuration = duration(epochs, params.epoch_identifier);
    const yearMintingProvision = (mintingEpochProvision * (365 * 24 * 3600)) / epochDuration;
    const baseInflation = totalSupply && yearMintingProvision / totalSupply;
    const calculatedApr = bondedRatio && baseInflation / bondedRatio;
    return {
      mintingEpochProvision,
      epochDuration,
      yearMintingProvision,
      baseInflation,
      calculatedApr
    };
  }

  function formatNumber(number) {
    return format(number, { notation: 'fixed' })
  }

  function duration(epochs, epochIdentifier) {
    const epoch = epochs.find((epoch) => epoch.identifier === epochIdentifier);
    if (!epoch) {
      return 0;
    }

    // Actually, the date type of golang protobuf is returned by the unit of seconds.
    return parseInt(epoch.duration.replace("s", ""));
  }

  return {
    refreshChains
  }
}

export default ChainMonitor
