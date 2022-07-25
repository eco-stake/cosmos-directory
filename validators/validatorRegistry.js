import _ from 'lodash'
import RegistryValidator from './registryValidator.js'
import { Validator } from './validator.js'

export const MAX_BLOCKS = 100

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
    for (let i = 0; i < MAX_BLOCKS - 1; i++) {
      keys.push(`blocks:${chainName}#${parseInt(latest.height) - (i + 1)}`)
    }
    let blocks = await client.json.mGet(keys, '$')
    blocks = [latest, ...blocks.map(el => el && el[0])]
    return _.compact(blocks).sort((a, b) => {
      return b.height - a.height
    })
  }

  async function getChainValidators(chain, includeRegistryData) {
    const data = await client.json.get('validators:' + chain.path, '$') || {}
    const validators = data.validators || {}
    const mapping = await addressMapping()
    const blocks = await getBlocks(chain.path)
    return Promise.all(Object.values(validators).map(async data => {
      const registryValidator = await getRegistryValidatorFromAddress(data.operator_address, mapping)
      const validator = buildValidator(chain, data, registryValidator, blocks, includeRegistryData)
      return validator
    }))
  }

  async function getChainValidator(chain, address, registryValidator, includeRegistryData) {
    const chainData = await client.json.get('validators:' + chain.path, {
      path: [
        '$.validators.' + address,
      ]
    })
    if(!chainData) return
    return buildValidator(chain, chainData[0], registryValidator, await getBlocks(chain.path), includeRegistryData)
  }

  function buildValidator(chain, chainData, registryValidator, blocks, includeRegistryData){
    if(registryValidator){
      const registryData = includeRegistryData ? _.pick(registryValidator, includeRegistryData) : {}
      const validatorChain = registryValidator.getChain(chain.path)
      const validator = new Validator(chain, chainData, { ...validatorChain, ...registryData }, blocks)
      registryValidator.setValidator(chain.path, validator)
      return validator
    }else{
      return new Validator(chain, chainData, {}, blocks)
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
