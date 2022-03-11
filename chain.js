const ChainApis = require('./chainApis')
const ChainAsset = require('./chainAsset')

const Chain = (chain, assetlist, previous) => {
  const { chain_name, status, network_type, pretty_name, chain_id } = chain
  const previousApis = previous && previous.apis.current
  const apis = ChainApis(chain.chain_id, chain.apis, previousApis)
  const assets = assetlist && assetlist.assets.map(el => ChainAsset(el))
  const baseAsset = assets && assets[0]

  const summary = () => {
    return {
      chain_name,
      status,
      network_type,
      pretty_name,
      chain_id,
      symbol: baseAsset && baseAsset.symbol,
      coingecko_id: baseAsset && baseAsset.coingecko_id,
      image: baseAsset && baseAsset.image,
      apis: apis.summary()
    }
  }


  return {
    chain,
    assetlist,
    apis,
    summary
  }
}

module.exports = Chain
