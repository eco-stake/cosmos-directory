import ChainApis from './chainApis.js'
import ChainAsset from './chainAsset.js'

const Chain = (directory, chain, assetlist, monitor, previous) => {
  const { chain_name, network_type, pretty_name, chain_id } = chain
  const previousApis = previous && previous.apis.current
  const apis = ChainApis(chain.chain_id, chain.apis || {}, monitor, previousApis)
  const assets = assetlist && assetlist.assets.map(el => ChainAsset(el))
  const baseAsset = assets && assets[0]

  const summary = () => {
    return {
      chain_name,
      directory,
      network_type,
      pretty_name,
      chain_id,
      status: chain.status,
      symbol: baseAsset && baseAsset.symbol,
      coingecko_id: baseAsset && baseAsset.coingecko_id,
      image: baseAsset && baseAsset.image,
      apis: apis.summary()
    }
  }

  const status = () => {
    return apis.status()
  }


  return {
    chain,
    assetlist,
    apis,
    summary,
    status
  }
}

export default Chain
