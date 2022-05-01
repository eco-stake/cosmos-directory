export class Validator {
  constructor(data, registryData){
    this.data = data || {}
    this.registryData = registryData || {}
    this.address = this.data.operator_address || this.registryData.address
    this.moniker = this.data.description?.moniker
    this.identity = this.data.description?.identity || this.registryData.profile?.identity
  }

  toJSON(){
    const { moniker, identity, address } = this
    const { path, name } = this.registryData
    return {
      path,
      name,
      moniker,
      identity,
      address,
      // ..._.omit(this.registryData, 'name'),
      ...this.registryData,
      ...this.data
    }
  }
}