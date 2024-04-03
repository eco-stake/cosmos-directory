import _ from 'lodash'
import RegistryValidator from './registryValidator.js'
import { Validator } from './validator.js'

export const MAX_BLOCKS = parseInt(process.env.MAX_BLOCKS || 100)

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

  async function getChainValidators(chain){
    const data = await client.json.get('validators:' + chain.path, '$') || {}
    return data.validators || {}
  }

  async function getChainValidatorsWithRegistry(chain) {
    const validators = await this.getChainValidators(chain)
    const mapping = await addressMapping()
    const blocks = await getBlocks(chain.path)
    return Promise.all(Object.values(validators).map(async data => {
      const registryValidator = await getRegistryValidatorFromAddress(data.operator_address, mapping)
      const validator = buildValidator(chain, data, registryValidator, blocks)
      return validator
    }))
  }

  async function getChainValidator(chain, address, registryValidator) {
    const chainData = await client.json.get('validators:' + chain.path, {
      path: [
        `\$.validators["${address}"]`,
      ]
    })
    if(!chainData) return
    return buildValidator(chain, chainData[0], registryValidator, await getBlocks(chain.path))
  }

  function buildValidator(chain, chainData, registryValidator, blocks){
    if(registryValidator){
      const validator = new Validator(chain, chainData, blocks, registryValidator)
      registryValidator.setValidator(chain.path, validator)
      return validator
    }else{
      return new Validator(chain, chainData, blocks)
    }
  }

  async function getRegistryValidatorsWithChains(chainRegistry) {
    const validators = await getRegistryValidators()
    const chainPaths = _.uniq(_.compact(validators.map(el => el.chains.map(chain => chain.name)).flat()))
    const chains = _.compact(await chainRegistry.getChains(chainPaths))
    const validatorData = await client.json.mGet(chains.map(el => 'validators:' + el.path), '$') || []
    for (const [index, chain] of chains.entries()) {
      const chainValidatorData = validatorData[index]
      const chainValidators = (chainValidatorData && chainValidatorData[0].validators) || []
      const registryValidators = validators.reduce((sum, validator) => {
        const chainData = validator.chains.find(el => el.name === chain.path)
        if (chainData) {
          sum[chainData.address] = validator
        }
        return sum
      }, {})
      for (const chainValidator of Object.values(chainValidators)) {
        const registryValidator = registryValidators[chainValidator.operator_address]
        if (registryValidator) {
          buildValidator(chain, chainValidator, registryValidator)
        }
      }
    }
    return validators
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
    getChainValidatorsWithRegistry,
    getChainValidators,
    getChainValidator,
    getRegistryValidatorsWithChains,
    getRegistryValidatorFromAddress,
    getRegistryValidators,
    getRegistryValidator,
    buildValidator,
    paths,
    repository,
    commit
  }
}

export default ValidatorRegistry
