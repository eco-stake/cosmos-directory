import _ from 'lodash'
import RegistryValidator from './registryValidator.js'
import { Validator } from './validator.js'

function ValidatorRegistry(client) {
  async function repository() {
    return await client.json.get('validator-registry:repository', '$') || {}
  }

  async function commit() {
    return await client.json.get('validator-registry:commit', '$') || {}
  }

  async function paths() {
    return await client.json.get('validator-registry:paths', '$') || []
  }

  async function addressMapping() {
    return await client.json.get('validator-registry:addresses', '$') || {}
  }

  async function getBlocks(chainName){
    const latest = await client.json.get('blocks:' + chainName, '$')
    if(!latest) return []

    const keys = []
    for (let i = 0; i < 99; i++) {
      keys.push(`blocks:${chainName}#${parseInt(latest.height) - (i + 1)}`)
    }
    let blocks = await client.json.mGet(keys, '$')
    blocks = [latest, ...blocks.map(el => el && el[0])]
    return _.compact(blocks).sort((a, b) => {
      return b.height - a.height
    })
  }

  async function getChainValidators(chainName) {
    const data = await client.json.get('validators:' + chainName, '$') || {}
    const validators = data.validators || {}
    const mapping = await addressMapping()
    const blocks = await getBlocks(chainName)
    return Promise.all(Object.values(validators).map(async data => {
      const registryValidator = await getRegistryValidatorFromAddress(data.operator_address, mapping)
      const validator = buildValidator(chainName, data, registryValidator, blocks)
      return validator
    }))
  }

  async function getChainValidator(chainName, address, registryValidator) {
    const chainData = await client.json.get('validators:' + chainName, {
      path: [
        '$.validators.' + address,
      ]
    })
    if(!chainData) return
    return buildValidator(chainName, chainData[0], registryValidator, await getBlocks(chainName))
  }

  function buildValidator(chainName, chainData, registryValidator, blocks){
    if(registryValidator){
      const registryData = _.take(registryValidator, ['path', 'name', 'profile'])
      const chain = registryValidator.getChain(chainName)
      const validator = new Validator(chainData, { ...chain, ...registryData }, blocks)
      registryValidator.setValidator(chainName, validator)
      return validator
    }else{
      return new Validator(chainData, {}, blocks)
    }
  }

  async function getRegistryValidatorFromAddress(address, mapping){
    mapping = mapping || await addressMapping()
    const path = mapping[address]
    if(!path) return

    return getRegistryValidator(path)
  }

  async function getRegistryValidators(addresses) {
    let names
    if(addresses){
      const mapping = await addressMapping()
      names = addresses.map(el => mapping[el])
    }else{
      names = await paths()
    }
    const validators = await Promise.all(names.map(async (path) => {
      return await getRegistryValidator(path)
    }))
    return _.compact(validators)
  }

  async function getRegistryValidator(path) {
    const data = await client.json.get('validator-registry:' + path, '$') || {}
    if (!data.profile)
      return

    return new RegistryValidator(data)
  }

  return {
    getChainValidators,
    getChainValidator,
    getRegistryValidatorFromAddress,
    getRegistryValidators,
    getRegistryValidator,
    paths,
    repository,
    commit
  }
}

export default ValidatorRegistry
