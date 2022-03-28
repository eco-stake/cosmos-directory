import Chain from '../chain/chain.js'

const ChainRegistry = (client) => {
  async function directories() {
    if (!await client.exists('chain-registry:directories')) {
      return []
    }

    return await client.json.get('chain-registry:directories', '$')
  }
   
  async function getChains() {
    const names = await directories()
    return Promise.all(names.map(async name => {
      return await getChain(name)
    }))
  }

  async function getChain(name) {
    if (!await client.exists('chain-registry:' + name)) {
      return
    }

    const data = await client.json.get('chain-registry:' + name, '$')
    if(!data.chain) return

    return Chain(client, data)
  }

  return {
    getChains,
    getChain,
    directories
  }
}

export default ChainRegistry
