import Bugsnag from "@bugsnag/js"
import ChainRegistry from './chains/chainRegistry.js';
import Repository from './repository/repository.js';
import HealthMonitor from './status/healthMonitor.js';
import { redisClient } from "./redisClient.js";
import ChainMonitor from "./chains/chainMonitor.js";

const chainUrl = process.env.CHAIN_URL || 'https://github.com/cosmos/chain-registry'
const chainBranch = process.env.CHAIN_BRANCH || 'master'
const chainPath = process.env.CHAIN_PATH
const repoRefreshSeconds = parseInt(process.env.REPO_REFRESH || 60 * 15)
const validatorUrl = process.env.VALIDATOR_URL || 'https://github.com/eco-stake/validator-registry'
const validatorBranch = process.env.VALIDATOR_BRANCH || 'master'
const chainRefreshSeconds = parseInt(process.env.CHAIN_REFRESH || 60 * 5)
const healthRefreshSeconds = parseInt(process.env.HEALTH_REFRESH || 10)

console.log("Using config:", {
  chainUrl,
  chainBranch,
  repoRefreshSeconds,
  validatorUrl,
  validatorBranch,
  chainRefreshSeconds,
  healthRefreshSeconds,
})

if(process.env.BUGSNAG_KEY){
  Bugsnag.start({
    apiKey: process.env.BUGSNAG_KEY,
    enabledReleaseStages: ['production', 'staging'],
    releaseStage: process.env.NODE_ENV
  })
}

async function queueHealthCheck(client, registry, health) {
  setTimeout(async () => {
    const chains = await registry.getChains()
    await health.refreshApis(client, chains)
    queueHealthCheck(client, registry, health)
  }, 1000 * healthRefreshSeconds)
}

async function queueChainCheck(client, registry, monitor) {
  setTimeout(async () => {
    const chains = await registry.getChains()
    await monitor.refreshChains(client, chains)
    queueChainCheck(client, registry, monitor)
  }, 1000 * chainRefreshSeconds)
}

(async () => {
  const client = await redisClient();

  const chainRepo = Repository(client, chainUrl, chainBranch, { path: chainPath, exclude: ['_template'], require: 'chain.json', filter: (chain) => {
    return chain.chain.status !== 'killed';
  }})
  const validatorRepo = Repository(client, validatorUrl, validatorBranch, { require: 'chains.json', storeMeta: async (name, allData) => {
    await client.json.set([name, 'addresses'].join(':'), '$', allData.reduce((sum, validator) => {
      for(const chain of validator.chains.chains){
        sum[chain.address] = validator.path
      }
      return sum
    }, {}))
  } })
  await chainRepo.refresh()
  setInterval(() => chainRepo.refresh(), 1000 * repoRefreshSeconds)

  await validatorRepo.refresh()
  setInterval(() => validatorRepo.refresh(), 1000 * repoRefreshSeconds)

  const chainRegistry = ChainRegistry(client)
  const chains = await chainRegistry.getChains()

  const healthMonitor = HealthMonitor()
  await healthMonitor.refreshApis(client, chains)
  if (healthRefreshSeconds > 0) {
    queueHealthCheck(client, chainRegistry, healthMonitor)
  }

  const chainMonitor = ChainMonitor()
  chainMonitor.refreshChains(client, chains)
  if (chainRefreshSeconds > 0) {
    queueChainCheck(client, chainRegistry, chainMonitor)
  }
})();
