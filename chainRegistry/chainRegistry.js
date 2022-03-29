import Chain from './chain.js'

function ChainRegistry(client) {
  async function paths() {
    if (!await client.exists('chain-registry:paths')) {
      return []
    }

    return await client.json.get('chain-registry:paths', '$')
  }

  async function getChains() {
    const names = await paths()
    return Promise.all(names.map(async name => {
      return await getChain(name)
    }))
  }

  async function getChain(name) {
    if (!await client.exists('chain-registry:' + name)) {
      return
    }

    const data = await client.json.get('chain-registry:' + name, '$')
    if (!data.chain)
      return

    return Chain(client, data)
  }

  return {
    getChains,
    getChain,
    paths
  }
}

export default ChainRegistry
