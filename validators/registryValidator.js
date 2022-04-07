import _ from "lodash"

function RegistryValidator(registryData) {
  const { path, profile, chains } = registryData

  function validatorForChain(chainName, chainValidators){
    const chain = chains.chains.find(el => el.name === chainName)
    if (!chain) return

    const { address } = chain
    const chainData = chainValidators[address] || {}
    const moniker = chainData.description?.moniker
    const identity = chainData.description?.identity || profile.identity
    return {
      path,
      name: profile.name,
      moniker,
      identity,
      address,
      ..._.omit(chain, 'name'),
      ...chainData
    }
  }

  return {
    path,
    name: profile.name,
    identity: profile.identity,
    ...registryData,
    validatorForChain
  }
}

export default RegistryValidator
