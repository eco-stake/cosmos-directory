const ChainApis = require('./chainApis')

const Chain = (chain, assetlist, previous) => {
  const previousApis = previous && previous.apis.current
  const apis = ChainApis(chain.chain_id, chain.apis, previousApis)

  return {
    chain,
    assetlist,
    apis
  }
}

module.exports = Chain
