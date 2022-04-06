import _ from 'lodash'
import Validator from './validator.js'

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
    const registryValidators = (await getValidators()).filter(el => !!el.chains.chains.find(chain => chain.name === chainName)).reduce((sum, validator) => {
      const { profile, path } = validator
      const chain = validator.chains.chains.find(el => el.name === chainName)
      sum[chain.address] = {
        path,
        ...profile,
        ..._.omit(chain, 'name')
      }
      return sum
    }, {})
    const addresses = [...new Set([...Object.keys(chainValidators), ...Object.keys(registryValidators)])]
    return addresses.map(address => {
      const chainData = chainValidators[address] || {}
      const registryData = registryValidators[address] || {}
      const { path, name } = registryData
      const moniker = chainData.description?.moniker
      const identity = chainData.description?.identity || registryData.identity
      return {
        path,
        name,
        moniker,
        identity,
        address,
        ...chainData,
        ...registryData
      }
    })
  }

  async function getChainValidators(chainName) {
    if (!await client.exists('validators:' + chainName)) {
      return {}
    }

    return await client.json.get('validators:' + chainName, '$')
  }

  async function getValidators() {
    const names = await paths()
    const validators = await Promise.all(names.map(async (name) => {
      return await getValidator(name)
    }))
    return _.compact(validators)
  }

  async function getValidator(name) {
    if (!await client.exists('validator-registry:' + name)) {
      return
    }

    const data = await client.json.get('validator-registry:' + name, '$')
    if (!data.profile)
      return

    return Validator(data)
  }

  return {
    getAllValidators,
    getValidators,
    getValidator,
    paths,
    repository,
    commit
  }
}

export default ValidatorRegistry
