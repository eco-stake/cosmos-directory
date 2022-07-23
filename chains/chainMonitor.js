import PQueue from 'p-queue';
import got from 'got';
import _ from 'lodash'
import Agent from 'agentkeepalive'
import { bignumber, multiply, divide, format } from 'mathjs'
import { debugLog, timeStamp } from '../utils.js';

function ChainMonitor() {
  const agent = {
    http: new Agent({ maxSockets: 20 }),
    https: new Agent.HttpsAgent({ maxSockets: 20 })
  }
  const queue = new PQueue({ concurrency: 10 });
  const axiosOpts = {
    timeout: { request: 5000 },
    retry: { limit: 3 },
    agent: agent
  }

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
      const blockParams = await getBlockParams(restUrl, chain), { actualBlocksPerYear } = blockParams
      const stakingParams = await getStakingParams(restUrl, chain) || {}, { bondedTokens } = stakingParams
      let supplyParams
      if (denom) {
        supplyParams = await getSupplyParams(restUrl, chain, bondedTokens)
      }
      const mintParams = await getMintParams(restUrl, chain) || {}, { blocksPerYear } = mintParams
      const distributionParams = await getDistributionParams(restUrl, chain) || {}, { communityTax } = distributionParams
      const provisionParams = await getProvisionParams(restUrl, chain, supplyParams) || {}, { annualProvision } = provisionParams
      const aprParams = await calculateApr(chain, annualProvision, bondedTokens, communityTax, blocksPerYear, actualBlocksPerYear)
      const data = { ...current, ...authzParams, ...blockParams, ...stakingParams, ...supplyParams, ...mintParams, ...distributionParams, ...provisionParams, ...aprParams }
      return _.mapKeys({
        ...data,
        bondedTokens: formatNumber(data.bondedTokens),
        totalSupply: formatNumber(data.totalSupply),
        annualProvision: formatNumber(data.annualProvision)
      }, (_value, key) => _.snakeCase(key))
    } catch (error) {
      timeStamp(chain.path, 'Update failed', error.message)
    }
  }

  async function getAuthzParams(restUrl) {
    try {
      await got.get(restUrl + 'cosmos/authz/v1beta1/grants', axiosOpts)
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
      const currentBlock = await got.get(restUrl + 'blocks/latest', axiosOpts).json()
      const currentBlockTime = new Date(currentBlock.block.header.time) / 1000
      const currentBlockHeight = currentBlock.block.header.height
      const prevBlock = await got.get(restUrl + 'blocks/' + (currentBlockHeight - 100), axiosOpts).json()
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
      const staking = await got.get(restUrl + 'cosmos/staking/v1beta1/params', axiosOpts).json();
      const unbondingTime = parseInt(staking.params.unbonding_time.replace('s', ''))
      const maxValidators = staking.params.max_validators
      const pool = await got.get(restUrl + 'cosmos/staking/v1beta1/pool', axiosOpts).json();
      const bondedTokens = bignumber(pool.pool.bonded_tokens);
      return {
        unbondingTime,
        maxValidators,
        bondedTokens
      }
    } catch (e) { timeStamp(chain.path, 'Staking check failed', e.message) }
  }

  async function getMintParams(restUrl, chain) {
    try {
        const mint = await got.get(restUrl + 'cosmos/mint/v1beta1/params', axiosOpts).json();
        const blocksPerYear = parseInt(mint.params.blocks_per_year)
        const blockTime = (365.3 * 24 * 60 * 60) / blocksPerYear
        const req = await got.get(restUrl + 'cosmos/mint/v1beta1/inflation', axiosOpts).json()
        const baseInflation = parseFloat(req.inflation);
        return {
          blocksPerYear,
          blockTime,
          baseInflation,
        }
    } catch (e) { timeStamp(chain.path, 'Mint check failed', e.message) }
  }

  async function getDistributionParams(restUrl, chain){
    try {
      const distribution = await got.get(restUrl + 'cosmos/distribution/v1beta1/params', axiosOpts).json();
      const communityTax = parseFloat(distribution.params.community_tax)
      return { communityTax }
    } catch (e) { timeStamp(chain.path, 'Distribution check failed', e.message) }
  }

  async function getProvisionParams(restUrl, chain, supplyParams){
    const path = chain.path
    try {
      if(path === 'crescent') {
        const params = await got.get('https://apigw.crescent.network/params', axiosOpts).json();
        const provison = params['data'].find(el => el.key === 'liquidstaking.total_reward_ucre_amount_per_year')?.value
        return { annualProvision: bignumber(provison) }
      } else if(path === 'emoney'){
        return { annualProvision: supplyParams.totalSupply * 0.1 }
      } else if(path === 'evmos'){
          const params = await got.get(restUrl + 'evmos/inflation/v1/params', axiosOpts).json();
          const provision = await got.get(restUrl + 'evmos/inflation/v1/epoch_mint_provision', axiosOpts).json();
          return { annualProvision: multiply(bignumber(provision.epoch_mint_provision.amount), 365.3, params.params.inflation_distribution.staking_rewards) }
      } else if(path === 'echelon'){
          const params = await got.get(restUrl + 'echelon/inflation/v1/params', axiosOpts).json();
          const provision = await got.get(restUrl + 'echelon/inflation/v1/epoch_mint_provision', axiosOpts).json();
          return { annualProvision: multiply(bignumber(provision.epoch_mint_provision.amount), 365.3, params.params.inflation_distribution.staking_rewards) }
      } else if(path === 'osmosis'){
          const params = await got.get(restUrl + 'osmosis/mint/v1beta1/params', axiosOpts).json();
          const provision = await got.get(restUrl + 'osmosis/mint/v1beta1/epoch_provisions', axiosOpts).json();
          return { annualProvision: multiply(bignumber(provision.epoch_provisions), 365.3, params.params.distribution_proportions.staking) }
      } else if(path === 'stargaze'){
          const params = await got.get(restUrl + 'minting/annual-provisions', axiosOpts).json();
          return { annualProvision: multiply(params.result, 0.5) }
      } else {
        try {
          const params = await got.get(restUrl + 'cosmos/mint/v1beta1/annual_provisions', axiosOpts).json();
          return { annualProvision: bignumber(params.annual_provisions) }
        } catch (e) {
          const params = await got.get(restUrl + 'minting/annual-provisions', axiosOpts).json();
          return { annualProvision: bignumber(params.result) }
        }
      }
    } catch (e) { timeStamp(path, 'Provision check failed', e.message) }
  }

  async function calculateApr(chain, annualProvision, bondedTokens, communityTax, blocksPerYear, actualBlocksPerYear){
    const path = chain.path
    try {
      if (path === 'sifchain') {
        const aprRequest = await got.get("https://data.sifchain.finance/beta/validator/stakingRewards", axiosOpts).json();
        return {
          calculatedApr: aprRequest.rate
        }
      } else {
        const estimatedApr = (annualProvision / bondedTokens) * (1 - communityTax)
        if(blocksPerYear){
          const calculatedApr = estimatedApr * (actualBlocksPerYear / blocksPerYear)
          return { estimatedApr, calculatedApr }
        }else{
          return { estimatedApr, calculatedApr: estimatedApr }
        }
      }
    } catch (e) { timeStamp(path, 'APR check failed', e.message) }
  }

  async function getSupplyParams(restUrl, chain, bondedTokens) {
    try {
      const { denom } = chain
      const supply = await got.get(restUrl + 'cosmos/bank/v1beta1/supply/' + denom, axiosOpts).json();
      const totalSupply = bignumber(supply.amount.amount);
      const bondedRatio = bondedTokens && parseFloat(divide(bondedTokens, totalSupply))
      return {
        totalSupply,
        bondedRatio
      }
    } catch (e) { timeStamp(chain.path, 'Supply check failed', e.message) }
  }

  function formatNumber(number) {
    return number && format(number, { notation: 'fixed' })
  }

  return {
    refreshChains
  }
}

export default ChainMonitor
