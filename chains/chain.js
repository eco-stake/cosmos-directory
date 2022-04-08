import ChainApis from "./chainApis.js";
import ChainAsset from './chainAsset.js'

function Chain(client, data) {
  const { path, chain, assetlist } = data;
  chain.name = chain.chain_name
  const assets = assetlist && assetlist.assets.map(el => ChainAsset(el));

  async function apis(type){
    const health = await apiHealth(type)
    return ChainApis(chain.apis || {}, health)
  }
  
  async function apiHealth(type) {
    if (!await client.exists('health:' + path)) {
      return {}
    }
    const healthPath = {}
    if(type){
      healthPath.path = [
        '.' + type,
      ]
    }
    const health = await client.json.get('health:' + path, healthPath)
    return type ? {[type]: health} : health
  }

  function baseAsset(){
    return assets && assets[0]
  }

  return {
    path: path,
    chainId: chain.chain_id,
    name: chain.name,
    prettyName: chain.pretty_name,
    assets,
    data,
    ...data,
    apis,
    baseAsset
  };
}

export default Chain
