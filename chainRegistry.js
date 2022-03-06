const git = require('isomorphic-git')
const http = require('isomorphic-git/http/node')
const fs = require('fs')
const path = require('path')
const Chain = require('./chain')

const ChainRegistry = (repoDir) => {
  const repoUrl = 'https://github.com/cosmos/chain-registry'
  let chains = {}

  const setConfig = () => {
    return git.setConfig({
      fs,
      dir: repoDir,
      path: 'user.name',
      value: 'ECO Stake'
    })
  }

  const updateRepo = () => {
    try {
      return git.pull({ fs, http, dir: repoDir, ref: 'master', singleBranch: true })
    } catch (e) {
      console.log('Failed to pull repo')
    }
  }

  const getChain = (dir) => {
    const chainPath = path.join(repoDir, dir, 'chain.json')
    const assetListPath = path.join(repoDir, dir, 'assetlist.json')
    const chainData = fs.readFileSync(chainPath)
    const assetListData = fs.existsSync(path) ? fs.readFileSync(assetListPath) : undefined
    const chainJson = JSON.parse(chainData)
    const assetListJson = assetListData && JSON.parse(assetListData)

    return Chain(chainJson, assetListJson)
  }

  const refresh = async () => {
    await setConfig()
    await updateRepo()

    const directories = fs.readdirSync(repoDir, { withFileTypes: true })
      .filter((item) => item.isDirectory())
      .map((item) => item.name);

    chains = directories.reduce((sum, dir) => {
      if(dir.startsWith('.') || dir == 'testnets') return sum

      sum[dir] = getChain(dir)

      return sum
    }, {})

    return chains
  }

  return {
    refresh
  }
}

module.exports = ChainRegistry
