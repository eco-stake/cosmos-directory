import PQueue from 'p-queue';
import got from 'got';
import _ from 'lodash'
import Agent from 'agentkeepalive'
import {bignumber, divide, format} from 'mathjs'
import { debugLog, timeStamp } from '../utils.js';
import { UniqueQueue } from '../uniqueQueue.js';

function ChainMonitor() {
  const agent = {
    http: new Agent({ maxSockets: 20 }),
    https: new Agent.HttpsAgent({ maxSockets: 20 })
  }
  const queue = new PQueue({ concurrency: 2, queueClass: UniqueQueue });

  async function refreshChains(client, chains) {
    timeStamp('Running chain update');
    await Promise.all([...chains].map(async (chain) => {
      if (!await client.exists('chains:' + chain.path)) await client.json.set('chains:' + chain.path, '$', {})
      const current = await client.json.get('chains:' + chain.path, '$')

      let chainParams = await getChainParams(chain, current.params || {});
      if(!chainParams) return timeStamp(chain.path, 'Empty chain response')

      await client.json.set('chains:' + chain.path, '$', {
        chainId: chain.chainId,
        lastUpdated: Date.now(),
        params: chainParams
      });
      debugLog(chain.path, 'Chain update complete')
    }));
    debugLog('Chain update complete')
  }

  function getChainParams(chain, current) {
    const { path, chainId, denom } = chain
    const request = async () => {
      const apis = await chain.apis('rest')
      const restUrl = apis.bestAddress('rest')
      if(!restUrl) return timeStamp(chain.path, 'No API URL')

      let data = current
      try { await got.get(restUrl + 'cosmos/authz/v1beta1/grants') } catch (error) {
        if (error.response?.statusCode === 400) {
          data.authz = true
        } else if(error.response?.statusCode === 501) {
          data.authz = false
        }
      }
      try {
        const currentBlock = await got.get(restUrl + 'blocks/latest').json()
        const currentBlockTime = new Date(currentBlock.block.header.time) / 1000
        const currentBlockHeight = currentBlock.block.header.height
        const prevBlock = await got.get(restUrl + 'blocks/' + (currentBlockHeight - 100)).json()
        const prevBlockTime = new Date(prevBlock.block.header.time) / 1000
        const prevBlockHeight = prevBlock.block.header.height
        const actualBlockTime = (currentBlockTime - prevBlockTime) / (currentBlockHeight - prevBlockHeight)
        const actualBlocksPerYear = (365 * 24 * 60 * 60) / actualBlockTime
        const staking = await got.get(restUrl + 'cosmos/staking/v1beta1/params').json();
        const unbondingTime = parseInt(staking.params.unbonding_time.replace('s', ''))
        const maxValidators = staking.params.max_validators
        const pool = await got.get(restUrl + 'cosmos/staking/v1beta1/pool').json();
        const bondedTokens = bignumber(pool.pool.bonded_tokens);
        let supply, totalSupply, bondedRatio, baseInflation, communityTax, estimatedApr, calculatedApr, blocksPerYear, blockTime
        if (denom){
          supply = await got.get(restUrl + 'cosmos/bank/v1beta1/supply/' + denom).json();
          totalSupply = bignumber(supply.amount.amount);
          bondedRatio = parseFloat(divide(bondedTokens, totalSupply))
          if (chainId.startsWith("osmosis")) {
            const osmosis = await osmosisParams(restUrl, totalSupply, bondedRatio);
            ({ baseInflation, estimatedApr } = osmosis)
            data = { ...data, ...osmosis }
          } else if (chainId.startsWith("sifchain")) {
            const aprRequest = await got.get(
              "https://data.sifchain.finance/beta/validator/stakingRewards"
            ).json();
            calculatedApr = aprRequest.rate;
          } else {
            try {
              const mint = await got.get(restUrl + 'cosmos/mint/v1beta1/params').json();
              blocksPerYear = parseInt(mint.params.blocks_per_year)
              blockTime = (365 * 24 * 60 * 60) / blocksPerYear
              const distribution = await got.get(restUrl + 'cosmos/distribution/v1beta1/params').json();
              communityTax = parseFloat(distribution.params.community_tax)
              const req = await got.get(restUrl + 'cosmos/mint/v1beta1/inflation').json()
              baseInflation = parseFloat(req.inflation);
              estimatedApr = ((baseInflation / bondedRatio) - communityTax)
              calculatedApr = estimatedApr * (actualBlocksPerYear / blocksPerYear)
            } catch (error) { 
              timeStamp(chain.path, 'Calculating APR failed', error.message)
            }
          }
        }
        return _.mapKeys({ 
          ...data,
          bondedTokens: bondedTokens && formatNumber(bondedTokens),
          totalSupply: totalSupply && formatNumber(totalSupply),
          blockTime,
          blocksPerYear,
          actualBlockTime,
          actualBlocksPerYear,
          unbondingTime,
          maxValidators,
          communityTax,
          bondedRatio,
          baseInflation,
          estimatedApr,
          calculatedApr
        }, (value, key) => _.snakeCase(key))
      } catch (error) {
        timeStamp(chain.path, 'Update failed', error.message)
        return data
      }
    };
    return queue.add(request, { identifier: path });
  }

  function formatNumber(number){
    return format(number, {notation: 'fixed'})
  }

  function duration(epochs, epochIdentifier) {
    const epoch = epochs.find((epoch) => epoch.identifier === epochIdentifier);
    if (!epoch) {
      return 0;
    }

    // Actually, the date type of golang protobuf is returned by the unit of seconds.
    return parseInt(epoch.duration.replace("s", ""));
  }

  async function osmosisParams(restUrl, totalSupply, bondedRatio) {
    const mintParams = await got.get(
      restUrl + "/osmosis/mint/v1beta1/params"
    ).json();
    const osmosisEpochs = await got.get(
      restUrl + "/osmosis/epochs/v1beta1/epochs"
    ).json();
    const epochProvisions = await got.get(
      restUrl + "/osmosis/mint/v1beta1/epoch_provisions"
    ).json();
    const { params } = mintParams;
    const { epochs } = osmosisEpochs;
    const { epoch_provisions } = epochProvisions;
    const mintingEpochProvision = parseFloat(params.distribution_proportions.staking) * epoch_provisions;
    const epochDuration = duration(epochs, params.epoch_identifier);
    const yearMintingProvision = (mintingEpochProvision * (365 * 24 * 3600)) / epochDuration;
    const baseInflation = yearMintingProvision / totalSupply;
    const calculatedApr = baseInflation / bondedRatio;
    return {
      mintingEpochProvision,
      epochDuration,
      yearMintingProvision,
      baseInflation,
      calculatedApr
    };
  }

  return {
    refreshChains
  }
}

export default ChainMonitor
