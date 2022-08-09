import _ from "lodash"
import {add} from 'mathjs'

export class RegistryValidator {
  constructor(data){
    this.data = data
    this.path = data.path
    this.profile = data.profile
    this.name = this.profile.name
    this.identity = this.profile.identity
    this.chains = data.chains.chains
    this.services = data.services?.services
    this.validators = {}
  }

  totalUSD(){
    return Object.values(this.validators).reduce((sum, validator) => {
      const delegations = validator.delegations()
      if(!delegations?.total_usd) return sum

      return add(sum, delegations.total_usd)
    }, 0)
  }

  totalUsers(){
    return Object.values(this.validators).reduce((sum, validator) => {
      const delegations = validator.delegations()
      if(!delegations?.total_count) return sum

      return add(sum, delegations.total_count)
    }, 0)
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
    return dataset && this.data[dataset]
  }

  toJSON(){
    const { path, name, identity, data, services } = this
    return {
      path,
      name,
      identity,
      image: this.chains[0]?.image,
      total_usd: this.totalUSD(),
      total_users: this.totalUsers(),
      ...data,
      chains: this.chains.map(chain => {
        const validator = this.validators[chain.name]
        return {
          ...chain,
          ...validator?.toJSON(true),
        }
      }),
      services
    }
  }
}

export default RegistryValidator
