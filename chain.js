import ChainApis from './chainApis.js'
import ChainAsset from './chainAsset.js'

const Chain = (directory, chain, assetlist, monitor) => {
  let apis, assets

  update(chain, assetlist)

  function update(newChain, newAssetlist) {
    chain = newChain
    if(apis){
      apis.update(newChain.apis || {})
    }else{
      apis = ChainApis(chain.chain_id, chain.apis || {}, monitor)
    }
    assets = newAssetlist && newAssetlist.assets.map(el => ChainAsset(el))
  }

  function summary() {
    const { chain_name, network_type, pretty_name, chain_id } = chain
    const baseAsset = assets && assets[0]
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

  function status() {
    return apis.status()
  }


  return {
    chain,
    assetlist,
    apis,
    summary,
    status,
    update
  }
}

export default Chain
