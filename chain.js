import ChainAsset from './chainAsset.js'

const Chain = (directory, chain, assetlist) => {
  const { apis } = chain
  const assets = assetlist && assetlist.assets.map(el => ChainAsset(el))

  return {
    chain,
    assetlist,
    apis,
    assets,
    directory,
    chainId: chain.chain_id,
    name: chain.name,
    prettyName: chain.pretty_name
  }
}

export default Chain
