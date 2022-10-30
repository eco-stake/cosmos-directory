import _ from 'lodash'
import ChainApis from "./chainApis.js";
import ChainAsset from './chainAsset.js'

function Chain(client, data, paramsData, opts) {
  const config = _.merge({
    consensusPrefix: `${data.chain.bech32_prefix}valcons`,
    monitor: {
      delegations: true,
      slashes: true,
      signing_info: true
    }
  }, opts)
  const { path, chain, assetlist } = data;
  const { params, versions, services, prices } = paramsData

  chain.name = chain.chain_name
  const coingecko = prices?.coingecko || {}
  const assets = assetlist && assetlist.assets.map(asset => {
    const price = coingecko[asset.display]

    return ChainAsset(asset, price && { coingecko: price })
  });
  const baseAsset = assets && assets[0]

  const prefix = chain.bech32_prefix
  const { consensusPrefix } = config

  async function apis(type){
    const health = await apiHealth(type)
    return ChainApis(health)
  }
  
  async function apiHealth(type) {
    const healthPath = {}
    if(type){
      healthPath.path = [
        '$.' + type,
      ]
    }
    const health = await client.json.get('health:' + path, healthPath) || {}
    return type ? {[type]: health[0]} : health
  }

  function apiUrls(type){
    switch (type) {
      case 'service':
        return serviceApis() || []
      case 'private-rpc':
      case 'private-rest':
        return privateApis(type.replace('private-', '')) || []
      default:
        return (chain.apis || {})[type] || []
    }
  }

  function serviceApis(){
    return (config.serviceApis || []).map(url => {
      return { ...url, service: true }
    })
  }

  function privateApis(type){
    return ((config.privateApis || {})[type] || []).map(url => {
      return { ...url, private: true }
    })
  }

  function getDataset(dataset){
    dataset = ['path'].includes(dataset) ? undefined : dataset
    return dataset && data[dataset]
  }

  return {
    path: path,
    chainId: chain.chain_id,
    name: chain.name,
    prettyName: chain.pretty_name,
    denom: baseAsset?.denom,
    symbol: baseAsset?.symbol,
    decimals: baseAsset?.decimals,
    coingeckoId: baseAsset?.coingecko_id,
    baseAsset,
    assets,
    prefix,
    consensusPrefix,
    ...data,
    config,
    params,
    versions,
    services,
    prices,
    apis,
    apiUrls,
    serviceApis,
    privateApis,
    getDataset,
  };
}

export default Chain
