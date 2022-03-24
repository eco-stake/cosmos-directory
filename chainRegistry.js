import Chain from './chain.js'

const ChainRegistry = (client) => {
  async function chainNames() {
    if (!await client.exists('chain-registry:chains')) {
      return []
    }

    return await client.json.get('chain-registry:chains', '$')
  }

  async function getChains() {
    const names = await chainNames()
    return Promise.all(names.map(async name => {
      return await getChain(name)
    }))
  }

  async function getChain(name) {
    if (!await client.exists('chain-registry:' + name)) {
      return
    }

    const data = await client.json.get('chain-registry:' + name, '$')
    return Chain(data.directory, data.chain, data.assetlist)
  }

  return {
    getChains,
    getChain,
    chainNames
  }
}

export default ChainRegistry
