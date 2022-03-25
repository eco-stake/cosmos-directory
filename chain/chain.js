import ChainAsset from './chainAsset.js'

const Chain = (data) => {
  const { chain, assetlist } = data
  const { apis } = chain
  const assets = assetlist && assetlist.assets.map(el => ChainAsset(el))

  return {
    ...data,
    apis,
    assets,
    chainId: chain.chain_id,
    name: chain.name,
    prettyName: chain.pretty_name
  }
}

export default Chain
