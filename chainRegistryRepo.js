import git from 'isomorphic-git'
import * as http from 'isomorphic-git/http/node/index.cjs'
import fs from 'fs'
import _ from 'lodash'
import { join } from 'path';
import { timeStamp } from './utils.js';

function ChainRegistryRepo(client, url, branch) {
  const repoDir = join(process.cwd(), '../chain-registry')

  async function updateRepo() {
    await git.clone({
      fs,
      http,
      dir: repoDir,
      ref: branch,
      url: url,
      depth: 1,
      singleBranch: true,
      skipCheckout: true
    })
    await git.fetch({ fs, http, dir: repoDir, ref: branch, url: url, singleBranch: true });
    await git.checkout({ fs, dir: repoDir, ref: `origin/${branch}`, force: true });
  }

  function buildChain(dir) {
    const chainPath = join(repoDir, dir, 'chain.json');
    const assetListPath = join(repoDir, dir, 'assetlist.json');
    const chainData = fs.readFileSync(chainPath);
    const assetListData = fs.existsSync(assetListPath) ? fs.readFileSync(assetListPath) : undefined;
    const chainJson = JSON.parse(chainData);
    const assetListJson = assetListData && JSON.parse(assetListData);
    return {
      directory: dir,
      chain: chainJson,
      assetlist: assetListJson
    };
  }

  async function refresh() {
    try {
      timeStamp('Loading chains');
      await updateRepo();
      await loadChains();
      timeStamp('Loaded chains');
    } catch (error) {
      timeStamp('Failed to update repository', error);
    }
  }

  async function loadChains() {
    const directories = fs.readdirSync(repoDir, { withFileTypes: true })
      .filter((item) => item.isDirectory())
      .map((item) => item.name);

    const chains = await Promise.all(directories.map(async dir => {
      if (dir.startsWith('.') || dir === 'testnets')
        return;

      const chain = buildChain(dir);

      await client.json.set('chain-registry:' + dir, '$', chain)

      return chain
    }, {}));

    await client.json.set('chain-registry:chains', '$', _.compact(chains).map(el => el.directory))
  }

  return {
    refresh
  }
}

export default ChainRegistryRepo