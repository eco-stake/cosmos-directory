import Chain from './chain.js'

function ChainRegistry(client) {
  async function repository() {
    return await client.json.get('chain-registry:repository', '$') || {}
  }

  async function commit() {
    return await client.json.get('chain-registry:commit', '$') || {}
  }

  async function paths() {
    return await client.json.get('chain-registry:paths', '$') || []
  }

  async function getChains() {
    const chainPaths = await paths()
    return Promise.all(chainPaths.map(async path => {
      return await getChain(path)
    }))
  }

  async function getChain(path) {
    const data = await client.json.get('chain-registry:' + path, '$') || {}
    if (!data.chain)
      return

    return Chain(client, data)
  }

  return {
    getChains,
    getChain,
    paths,
    repository,
    commit
  }
}

export default ChainRegistry
