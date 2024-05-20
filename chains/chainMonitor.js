import PQueue from 'p-queue';
import got from 'got';
import _ from 'lodash'
import { compareVersions, validate } from 'compare-versions';
import { bignumber, multiply, divide, floor } from 'mathjs'
import { createAgent, debugLog, timeStamp, formatNumber } from '../utils.js';

function ChainMonitor() {
  const agent = createAgent();
  const queue = new PQueue({ concurrency: 10 });
  const gotOpts = {
    timeout: { request: 5000 },
    retry: { limit: 3 },
    agent: agent
  }

  async function refreshChains(client, chains) {
    timeStamp('Running chain update');
    await Promise.all([...chains].map((chain) => {
      const request = async () => {
        const apis = await chain.apis()
        const restUrl = apis.bestServiceAddress()
        if (!restUrl) return timeStamp(chain.path, 'No API URL')

        const current = await client.json.get('chains:' + chain.path, '$') || {}

        let chainParams = await getChainParams(restUrl, chain, current.params || {});
        let versionParams = await getVersionParams(chain, apis, current.versions || {})

        await client.json.set('chains:' + chain.path, '$', {
          ...current,
          chainId: chain.chainId,
          lastUpdated: Date.now(),
          params: chainParams || current.params,
          versions: versionParams || current.versions
        });
        debugLog(chain.path, 'Chain update complete')
      };
      return queue.add(request, { identifier: chain.path });
    }));
    debugLog('Chain update complete')
  }

  async function getVersionParams(chain, apis, current){
    try {
      const versions = {
        application_version: [],
        cosmos_sdk_version: [],
        tendermint_version: []
      }
      await Promise.all(['rest', 'private-rest'].map(async (type) => {
        const urls = apis.availableUrls(type)
        await Promise.all(urls.map(async (url) => {
          try {
            const response = await got.get(url.finalAddress + '/cosmos/base/tendermint/v1beta1/node_info', gotOpts)
            const data = JSON.parse(response.body)
            const { version, cosmos_sdk_version } = data.application_version
            const tendermint_version = data.default_node_info?.version || data.node_info?.version
            if(validate(version)) versions.application_version.push(version)
            if(validate(cosmos_sdk_version)) versions.cosmos_sdk_version.push(cosmos_sdk_version)
            if(validate(tendermint_version)) versions.tendermint_version.push(tendermint_version)
          } catch (error) {
            debugLog(chain.path, url.finalAddress, 'Node update failed:', error.message)
          }
        }))
      }));
      // use the lowest available version
      return {
        application_version: versions.application_version.sort(compareVersions)[0] || current.application_version,
        cosmos_sdk_version: versions.cosmos_sdk_version.sort(compareVersions)[0] || current.cosmos_sdk_version,
        tendermint_version: versions.tendermint_version.sort(compareVersions)[0] || current.tendermint_version
      }
    } catch (error) {
      timeStamp(chain.path, 'Version update failed', error.message)
    }
  }

  async function getChainParams(restUrl, chain, current) {
    const { denom } = chain
    try {
      const authzParams = await getAuthzParams(restUrl)
      const blockParams = await getBlockParams(restUrl, chain) || {}, { actualBlocksPerYear } = blockParams
      const stakingParams = await getStakingParams(restUrl, chain) || {}, { bondedTokens } = stakingParams
      const slashingParams = await getSlashingParams(restUrl, chain) || {}
      let supplyParams = {}
      if (denom) {
        supplyParams = await getSupplyParams(restUrl, chain, bondedTokens) || {}
      }
      const mintParams = await getMintParams(restUrl, chain) || {}, { blocksPerYear } = mintParams
      const distributionParams = await getDistributionParams(restUrl, chain) || {}, { communityTax } = distributionParams
      const provisionParams = await getProvisionParams(restUrl, chain, supplyParams, blockParams) || {}, { annualProvision } = provisionParams
      const aprParams = await calculateApr(chain, annualProvision, bondedTokens, communityTax, blocksPerYear, actualBlocksPerYear) || {}
      const data = {
        ...current,
        ...authzParams,
        ...blockParams,
        ...stakingParams,
        ...slashingParams,
        ...supplyParams,
        ...mintParams,
        ...distributionParams,
        ...provisionParams,
        ...aprParams
      }
      return _.mapKeys({
        ...data,
        bondedTokens: formatNumber(data.bondedTokens),
        totalSupply: formatNumber(data.totalSupply),
        annualProvision: formatNumber(data.annualProvision)
      }, (_value, key) => _.snakeCase(key))
    } catch (error) {
      timeStamp(chain.path, 'Params update failed', error.message)
    }
  }

  async function getAuthzParams(restUrl) {
    try {
      await got.get(restUrl + 'cosmos/authz/v1beta1/grants', gotOpts)
    } catch (error) {
      if ([400, 500].includes(error.response?.statusCode)) {
        return { authz: true }
      } else if (error.response?.statusCode === 501) {
        return { authz: false }
      }
    }
  }

  async function getBlockParams(restUrl, chain) {
    try {
      const currentBlock = await got.get(`${restUrl}cosmos/base/tendermint/v1beta1/blocks/latest`, gotOpts).json()
      const currentBlockTime = new Date(currentBlock.block.header.time) / 1000
      const currentBlockHeight = currentBlock.block.header.height
      const blocksToCompare = process.env.BLOCKS_TO_COMPARE || Math.min(1000, currentBlockHeight - 1)
      const prevBlock = await got.get(`${restUrl}cosmos/base/tendermint/v1beta1/blocks/${currentBlockHeight - blocksToCompare}`, gotOpts).json()
      const prevBlockTime = new Date(prevBlock.block.header.time) / 1000
      const prevBlockHeight = prevBlock.block.header.height
      const actualBlockTime = (currentBlockTime - prevBlockTime) / (currentBlockHeight - prevBlockHeight)
      const actualBlocksPerYear = (365 * 24 * 60 * 60) / actualBlockTime
      return {
        actualBlockTime,
        actualBlocksPerYear,
        currentBlockHeight
      }
    } catch (e) { timeStamp(chain.path, 'Block check failed', e.message) }
  }

  async function getStakingParams(restUrl, chain) {
    try {
      const staking = await got.get(restUrl + 'cosmos/staking/v1beta1/params', gotOpts).json();
      const unbondingTime = parseInt(staking.params.unbonding_time.replace('s', ''))
      const maxValidators = staking.params.max_validators
      const pool = await got.get(restUrl + 'cosmos/staking/v1beta1/pool', gotOpts).json();
      const bondedTokens = bignumber(pool.pool.bonded_tokens);
      return {
        unbondingTime,
        maxValidators,
        bondedTokens,
        staking: staking.params
      }
    } catch (e) { timeStamp(chain.path, 'Staking check failed', e.message) }
  }

  async function getSlashingParams(restUrl, chain) {
    try {
      const slashing = await got.get(restUrl + 'cosmos/slashing/v1beta1/params', gotOpts).json();
      return {
        slashing: slashing.params
      }
    } catch (e) { timeStamp(chain.path, 'Slashing check failed', e.message) }
  }

  async function getMintParams(restUrl, chain) {
    try {
        const mint = await got.get(restUrl + 'cosmos/mint/v1beta1/params', gotOpts).json();
        const blocksPerYear = parseInt(mint.params.blocks_per_year)
        const blockTime = (365.3 * 24 * 60 * 60) / blocksPerYear
        const req = await got.get(restUrl + 'cosmos/mint/v1beta1/inflation', gotOpts).json()
        const baseInflation = parseFloat(req.inflation);
        return {
          blocksPerYear,
          blockTime,
          baseInflation,
          mint: mint.params
        }
    } catch (e) { timeStamp(chain.path, 'Mint check failed', e.message) }
  }

  async function getDistributionParams(restUrl, chain){
    try {
      const distribution = await got.get(restUrl + 'cosmos/distribution/v1beta1/params', gotOpts).json();
      const communityTax = parseFloat(distribution.params.community_tax)
      return { communityTax, distribution: distribution.params }
    } catch (e) { timeStamp(chain.path, 'Distribution check failed', e.message) }
  }

  async function getProvisionParams(restUrl, chain, supplyParams, blockParams){
    const path = chain.path
    try {
      switch (path) {
        case 'crescent': {
          const params = await got.get('https://apigw-v3.crescent.network/params', gotOpts).json();
          const provison = params['data'].find(el => el.key === 'liquidstaking.total_reward_ucre_amount_per_year')?.value
          return { annualProvision: bignumber(provison) }
        }
        case 'emoney':
          return { annualProvision: supplyParams.totalSupply * 0.1 }
        case 'evmos':
        case 'echelon': {
          const params = await got.get(restUrl + path + '/inflation/v1/params', gotOpts).json();
          const provision = await got.get(restUrl + path + '/inflation/v1/epoch_mint_provision', gotOpts).json();
          return {
            annualProvision: multiply(bignumber(provision.epoch_mint_provision.amount), 365.3, params.params.inflation_distribution.staking_rewards),
            inflation: params.params
          }
        }
        case 'quicksilver':
        case 'osmosis': {
          const params = await got.get(restUrl + path + '/mint/v1beta1/params', gotOpts).json();
          const provision = await got.get(restUrl + path + '/mint/v1beta1/epoch_provisions', gotOpts).json();
          const dailyProvision = bignumber(provision.epoch_provisions)
          return {
            annualProvision: multiply(dailyProvision, 365.3, params.params.distribution_proportions.staking),
            mint: params.params
          }
        }
        case 'teritori': {
          const params = await got.get(restUrl + 'teritori/mint/v1beta1/params', gotOpts).json();
          const reductionFactor = params.params.reduction_factor
          const reductionCount = floor(divide(blockParams.currentBlockHeight, params.params.reduction_period_in_blocks))
          let blockProvision = params.params.genesis_block_provisions
          for(let i = 0; i < reductionCount; i++){
            blockProvision = multiply(blockProvision, reductionFactor)
          }
          const stakingDistribution = params.params.distribution_proportions.staking
          return {
            blockProvision,
            reductionFactor,
            reductionCount,
            stakingDistribution,
            annualProvision: multiply(blockProvision, blockParams.actualBlocksPerYear, stakingDistribution),
            mint: undefined
          }
        }
        default: {
          const stakingProvisionFactor = {
            'stargaze': 0.5,
            'omniflixhub': 0.6
          }
          let annualProvision
          try {
            const params = await got.get(restUrl + 'cosmos/mint/v1beta1/annual_provisions', gotOpts).json();
            annualProvision = bignumber(params.annual_provisions)
          } catch (e) {
            const params = await got.get(restUrl + 'minting/annual-provisions', gotOpts).json();
            annualProvision = bignumber(params.result)
          }
          if(annualProvision){
            return { annualProvision: multiply(annualProvision, stakingProvisionFactor[chain.path] ?? 1) }
          }
        }
      }
    } catch (e) { timeStamp(path, 'Provision check failed', e.message) }
  }

  async function calculateApr(chain, annualProvision, bondedTokens, communityTax, blocksPerYear, actualBlocksPerYear) {
    const path = chain.path
    try {
      if (path === 'dydx' && process.env.APYBARA_API_KEY) {
        const opts = {
          headers: {
            'X-ACCESS-KEY': `${process.env.APYBARA_API_KEY}`
          },
          ...gotOpts
        }
        const aprRequest = await got.get("https://api.protocolstaking.info/v0/protocols/dydx", opts).json();
        return {
          calculatedApr: aprRequest[0]?.rewardRate
        }
      } else if (path === 'sifchain') {
        const aprRequest = await got.get("https://data.sifchain.finance/beta/validator/stakingRewards", gotOpts).json();
        return {
          calculatedApr: aprRequest.rate
        }
      } else if (annualProvision && bondedTokens){
        const estimatedApr = (annualProvision / bondedTokens) * (1 - communityTax)
        if (blocksPerYear) {
          const calculatedApr = estimatedApr * (actualBlocksPerYear / blocksPerYear)
          return { estimatedApr, calculatedApr }
        } else {
          return { estimatedApr, calculatedApr: estimatedApr }
        }
      }
    } catch (e) { timeStamp(path, 'APR check failed', e.message) }
  }

  async function getSupplyParams(restUrl, chain, bondedTokens) {
    try {
      const { denom } = chain
      const supply = await got.get(restUrl + 'cosmos/bank/v1beta1/supply/' + denom, gotOpts).json();
      const totalSupply = bignumber(supply.amount.amount);
      const bondedRatio = bondedTokens && parseFloat(divide(bondedTokens, totalSupply))
      return {
        totalSupply,
        bondedRatio
      }
    } catch (e) { timeStamp(chain.path, 'Supply check failed', e.message) }
  }

  return {
    refreshChains
  }
}

export default ChainMonitor
