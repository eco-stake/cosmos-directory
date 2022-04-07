import _ from 'lodash'
import RegistryValidator from './registryValidator.js'

function ValidatorRegistry(client) {
  async function repository() {
    if (!await client.exists('validator-registry:repository')) return {}

    return await client.json.get('validator-registry:repository', '$')
  }

  async function commit() {
    if (!await client.exists('validator-registry:commit')) return {}

    return await client.json.get('validator-registry:commit', '$')
  }

  async function paths() {
    if (!await client.exists('validator-registry:paths')) {
      return []
    }

    return await client.json.get('validator-registry:paths', '$')
  }

  async function getAllValidators(chainName) {
    const chainValidators = (await getChainValidators(chainName)).validators || {}
    const registryValidators = (await getRegistryValidators()).reduce((sum, registryValidator) => {
      const validator = registryValidator.validatorForChain(chainName, chainValidators)
      if(!validator) return sum

      sum[validator.address] = validator
      return sum
    }, {})
    const addresses = [...new Set([...Object.keys(chainValidators), ...Object.keys(registryValidators)])]
    return addresses.map(address => {
      const registryData = registryValidators[address]
      if(registryData){
        return registryData
      }else{
        const chainData = chainValidators[address] || {}
        const moniker = chainData.description?.moniker
        const identity = chainData.description?.identity
        return {
          moniker,
          identity,
          address,
          ...chainData
        }
      }
    })
  }

  async function getChainValidators(chainName) {
    if (!await client.exists('validators:' + chainName)) {
      return {}
    }

    return await client.json.get('validators:' + chainName, '$')
  }

  async function getChainValidator(chainName, address) {
    if (!await client.exists('validators:' + chainName)) {
      return {}
    }

    return await client.json.get('validators:' + chainName, {
      path: [
        '.validators.' + address,
      ]
    })
  }

  async function getRegistryValidators() {
    const names = await paths()
    const validators = await Promise.all(names.map(async (path) => {
      return await getRegistryValidator(path)
    }))
    return _.compact(validators)
  }

  async function getRegistryValidator(path) {
    if (!await client.exists('validator-registry:' + path)) {
      return
    }

    const data = await client.json.get('validator-registry:' + path, '$')
    if (!data.profile)
      return

    return RegistryValidator(data)
  }

  return {
    getAllValidators,
    getChainValidators,
    getChainValidator,
    getRegistryValidators,
    getRegistryValidator,
    paths,
    repository,
    commit
  }
}

export default ValidatorRegistry
