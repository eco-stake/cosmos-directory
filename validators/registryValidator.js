import _ from "lodash"

export class RegistryValidator {
  constructor(data){
    this.data = data
    this.path = data.path
    this.profile = data.profile
    this.name = this.profile.name
    this.identity = this.profile.identity
    this.chains = data.chains.chains
    this.validators = {}
  }

  getChain(chainName){
    return this.chains.find(el => el.name === chainName)
  }

  getValidator(chainName){
    return this.validators[chainName]
  }

  setValidator(chainName, validator){
    return this.validators[chainName] = validator
  }

  getDataset(dataset){
    dataset = ['path'].includes(dataset) ? undefined : dataset
    return dataset && data[dataset]
  }

  toJSON(){
    const { path, name, identity, data } = this
    return {
      path,
      name,
      identity,
      ...data,
      chains: this.chains.map(chain => {
        const validator = this.validators[chain.name]
        return {
          ...chain,
          ...validator?.toJSON()
        }
      })
    }
  }
}

export default RegistryValidator
