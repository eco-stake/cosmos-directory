import _ from 'lodash'
import Validator from './validator.js'

function ValidatorRegistry(client) {
  async function paths() {
    if (!await client.exists('validator-registry:paths')) {
      return []
    }

    return await client.json.get('validator-registry:paths', '$')
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
    getValidators,
    getValidator,
    paths
  }
}

export default ValidatorRegistry
