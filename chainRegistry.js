import { setConfig as _setConfig, fetch, checkout } from 'isomorphic-git'
import * as http from 'isomorphic-git/http/node/index.cjs'
import fs from 'fs'
import { join } from 'path'
import { timeStamp } from './utils.js';
import Chain from './chain.js'
import HealthMonitor from "./healthMonitor.js"

const ChainRegistry = (repoDir, branch) => {
  const monitor = HealthMonitor()
  let chains = {}

  const status = () => {
    return {
      monitorQueue: monitor.size(),
      chains: chainNames()
    }
  }

  const setConfig = () => {
    return _setConfig({
      fs,
      dir: repoDir,
      path: 'user.name',
      value: 'ECO Stake'
    })
  }

  const updateRepo = async () => {
    await setConfig()
    await fetch({ fs, http, dir: repoDir, ref: branch })
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
    const existing = getChain(dir)
    if(existing){
      existing.update(chainJson, assetListJson)
      return existing
    }else{
      return Chain(dir, chainJson, assetListJson, monitor)
    }
  }

  const refresh = async () => {
    try {
      timeStamp('Loading chains');
      await updateRepo()
      loadChains()
      timeStamp('Loaded chains', chainNames());
    } catch (error) {
      timeStamp('Failed to update repository', error);
    }
  }

  const refreshApis = async () => {
    timeStamp('Refreshing APIs');
    await Promise.all([...getChains()].map(async chain => {
      await chain.apis.refreshUrls()
    }))
    timeStamp('Refreshed APIs');
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
    status,
    refresh,
    refreshApis,
    getChains,
    getChain,
    chainNames
  }
}

export default ChainRegistry
