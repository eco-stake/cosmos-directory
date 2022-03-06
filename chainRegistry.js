const git = require('isomorphic-git')
const http = require('isomorphic-git/http/node')
const fs = require('fs')
const path = require('path')
const Chain = require('./chain')

const ChainRegistry = (repoDir) => {
  const repoUrl = 'https://github.com/cosmos/chain-registry'
  var chains

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

    chains = directories.reduce((sum, dir) => {
      if(dir.startsWith('.') || dir === 'testnets') return sum

      sum[dir] = fetchChain(dir)

      return sum
    }, {})

    console.log(Object.keys(chains))
    return chains
  }

  chains = loadChains()

  return {
    refresh,
    chains,
    getChain
  }
}

module.exports = ChainRegistry
