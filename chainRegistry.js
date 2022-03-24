import { setConfig as _setConfig, fetch, checkout, addRemote } from 'isomorphic-git'
import * as http from 'isomorphic-git/http/node/index.cjs'
import fs from 'fs'
import { join } from 'path'
import { timeStamp } from './utils.js';
import Chain from './chain.js'

const ChainRegistry = (repoDir, url, branch) => {
  let chains = {}

  const setConfig = async () => {
    await _setConfig({
      fs,
      dir: repoDir,
      path: 'user.name',
      value: 'ECO Stake'
    })
    await addRemote({
      fs,
      dir: repoDir,
      remote: 'origin',
      url: url
    })
  }

  const updateRepo = async () => {
    await setConfig()
    await fetch({ fs, http, dir: repoDir, ref: branch, url: url, singleBranch: true })
    await checkout({ fs, dir: repoDir, ref: `origin/${branch}`, force: true })
  }

  const chainNames = () => {
    return Object.keys(chains)
  }

  const getChains = () => {
    return Object.values(chains)
  }

  const getChain = (name) => {
    return chains[name]
  }

  const buildChain = (dir) => {
    const chainPath = join(repoDir, dir, 'chain.json')
    const assetListPath = join(repoDir, dir, 'assetlist.json')
    const chainData = fs.readFileSync(chainPath)
    const assetListData = fs.existsSync(assetListPath) ? fs.readFileSync(assetListPath) : undefined
    const chainJson = JSON.parse(chainData)
    const assetListJson = assetListData && JSON.parse(assetListData)
    return Chain(dir, chainJson, assetListJson)
  }

  const refresh = async () => {
    try {
      timeStamp('Loading chains');
      if(process.env.NODE_APP_INSTANCE === '0'){
        timeStamp('Updating repo');
        await updateRepo()
      }else{
        timeStamp('Sleeping for 2 seconds to allow leader to update');
        await new Promise(r => setTimeout(r, 2000));
      }
      loadChains()
      timeStamp('Loaded chains', chainNames());
    } catch (error) {
      timeStamp('Failed to update repository', error);
    }
  }

  const loadChains = () => {
    const directories = fs.readdirSync(repoDir, { withFileTypes: true })
      .filter((item) => item.isDirectory())
      .map((item) => item.name);

    chains = directories.reduce((sum, dir) => {
      if(dir.startsWith('.') || dir === 'testnets') return sum

      sum[dir] = buildChain(dir)

      return sum
    }, {})
  }

  return {
    refresh,
    getChains,
    getChain,
    chainNames
  }
}

export default ChainRegistry
