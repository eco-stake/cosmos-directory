const ChainApis = require('./chainApis')

const Chain = (chain, assetlist) => {
  const apis = ChainApis(chain.chain_id, chain.apis)

  return {
    chain,
    assetlist,
    apis
  }
}

module.exports = Chain
