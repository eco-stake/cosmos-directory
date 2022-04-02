import ChainApis from "./chainApis.js";
import ChainAsset from './chainAsset.js'

function Chain(client, data) {
  const { chain, assetlist } = data;
  chain.name = chain.chain_name
  const apis = ChainApis(client, chain.chain_id, chain.apis || {});
  const assets = assetlist && assetlist.assets.map(el => ChainAsset(el));

  return {
    chainId: chain.chain_id,
    name: chain.name,
    prettyName: chain.pretty_name,
    apis,
    assets,
    data,
    ...data
  };
}

export default Chain
