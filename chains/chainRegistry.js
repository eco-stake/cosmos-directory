import fs from 'fs'
import _ from 'lodash'
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

  async function getChains(chainPaths) {
    chainPaths = chainPaths || await paths()
    const config = getConfig()
    return Promise.all(chainPaths.map(async path => {
      return await getChain(path, config[path] || {})
    }))
  }

  async function getChain(path, config) {
    config = config || getConfig(path)
    const data = await client.json.get('chain-registry:' + path, '$') || {}
    if (!data.chain)
      return

    const params = await client.json.get('chains:' + path, '$') || {}
    return Chain(client, data, params, config)
  }

  function getConfig(path){
    try {
      const systemConfigFile = fs.readFileSync('config.json');
      const systemConfig = systemConfigFile && JSON.parse(systemConfigFile) || {}
      let localConfigFile
      try {
        localConfigFile = fs.readFileSync('config/config.local.json');
      } catch {}
      const localConfig = localConfigFile && JSON.parse(localConfigFile) || {}
      const config = _.mergeWith(systemConfig, localConfig, (a, b) =>
        _.isArray(b) ? b : undefined
      )
      return (path ? config[path] : config) || {}
    } catch (error) {
      console.log(error)
      return {}
    }
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
