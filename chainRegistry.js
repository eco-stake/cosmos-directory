import { setConfig as _setConfig, fetch, checkout } from 'isomorphic-git'
import * as http from 'isomorphic-git/http/node/index.cjs'
import fs from 'fs'
import { join } from 'path'
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

  const fetchChain = (dir) => {
    const chainPath = join(repoDir, dir, 'chain.json')
    const assetListPath = join(repoDir, dir, 'assetlist.json')
    const chainData = fs.readFileSync(chainPath)
    const assetListData = fs.existsSync(assetListPath) ? fs.readFileSync(assetListPath) : undefined
    const chainJson = JSON.parse(chainData)
    const assetListJson = assetListData && JSON.parse(assetListData)
    const existing = getChain(dir)

    return Chain(dir, chainJson, assetListJson, monitor, existing)
  }

  const refresh = async () => {
    try {
      await updateRepo()
      monitor.clear()
      loadChains()
    } catch (error) {
      console.log('Failed to update repository', error)
    }
  }

  const loadChains = () => {
    const directories = fs.readdirSync(repoDir, { withFileTypes: true })
      .filter((item) => item.isDirectory())
      .map((item) => item.name);

    const newChains = directories.reduce((sum, dir) => {
      if(dir.startsWith('.') || dir === 'testnets') return sum

      sum[dir] = fetchChain(dir)

      return sum
    }, {})

    chains = newChains
    console.log('Loaded chains', chainNames())
    return chains
  }

  return {
    status,
    refresh,
    getChains,
    getChain,
    chainNames
  }
}

export default ChainRegistry
