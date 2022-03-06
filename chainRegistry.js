const git = require('isomorphic-git')
const http = require('isomorphic-git/http/node')
const fs = require('fs')
const path = require('path')
const Chain = require('./chain')

const ChainRegistry = (repoDir) => {
  const repoUrl = 'https://github.com/cosmos/chain-registry'
  let chains

  const setConfig = () => {
    return git.setConfig({
      fs,
      dir: repoDir,
      path: 'user.name',
      value: 'ECO Stake'
    })
  }

  const updateRepo = () => {
    return setConfig().then(() => {
      return git.pull({ fs, http, dir: repoDir, ref: 'master', singleBranch: true })
    })
  }

  const chainNames = () => {
    return Object.keys(chains)
  }

  const getChain = (name) => {
    return chains[name]
  }

  const fetchChain = (dir) => {
    const chainPath = path.join(repoDir, dir, 'chain.json')
    const assetListPath = path.join(repoDir, dir, 'assetlist.json')
    const chainData = fs.readFileSync(chainPath)
    const assetListData = fs.existsSync(assetListPath) ? fs.readFileSync(assetListPath) : undefined
    const chainJson = JSON.parse(chainData)
    const assetListJson = assetListData && JSON.parse(assetListData)

    return Chain(chainJson, assetListJson)
  }

  const refresh = () => {
    return updateRepo().then(() => {
      loadChains()
    })
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
    refresh,
    getChain,
    chainNames
  }
}

module.exports = ChainRegistry
