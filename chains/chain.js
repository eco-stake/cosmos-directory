import ChainApis from "./chainApis.js";
import ChainAsset from './chainAsset.js'

function Chain(client, data) {
  const { path, chain, assetlist } = data;
  chain.name = chain.chain_name
  const assets = assetlist && assetlist.assets.map(el => ChainAsset(el));
  const apis = ChainApis(client, path, chain.apis || {});

  return {
    path: path,
    chainId: chain.chain_id,
    name: chain.name,
    prettyName: chain.pretty_name,
    assets,
    apis,
    data,
    ...data
  };
}

export default Chain
