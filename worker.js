import Bugsnag from "@bugsnag/js"
import ChainRegistry from './chains/chainRegistry.js';
import Repository from './repository/repository.js';
import HealthMonitor from './status/healthMonitor.js';
import ValidatorMonitor from './validators/validatorMonitor.js';
import { redisClient } from "./redisClient.js";
import ChainMonitor from "./chains/chainMonitor.js";
import BlockMonitor from "./chains/blockMonitor.js";

const chainUrl = process.env.CHAIN_URL || 'https://github.com/cosmos/chain-registry'
const chainBranch = process.env.CHAIN_BRANCH || 'master'
const repoRefreshSeconds = parseInt(process.env.REPO_REFRESH || 900)
const validatorUrl = process.env.VALIDATOR_URL || 'https://github.com/eco-stake/validator-registry'
const validatorBranch = process.env.VALIDATOR_BRANCH || 'master'
const validatorRefreshSeconds = parseInt(process.env.VALIDATOR_REFRESH || 900)
const chainRefreshSeconds = parseInt(process.env.CHAIN_REFRESH || 60)
const healthRefreshSeconds = parseInt(process.env.HEALTH_REFRESH || 10)
const REPO_REFRESH_INTERVAL = 1000 * repoRefreshSeconds
const VALIDATOR_REFRESH_INTERVAL = 1000 * validatorRefreshSeconds
const CHAIN_REFRESH_INTERVAL = 1000 * chainRefreshSeconds
const HEALTH_REFRESH_INTERVAL = 1000 * healthRefreshSeconds

console.log("Using config:", {
  chainUrl,
  chainBranch,
  repoRefreshSeconds,
  validatorUrl,
  validatorBranch,
  validatorRefreshSeconds,
  chainRefreshSeconds,
  healthRefreshSeconds
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
  }, HEALTH_REFRESH_INTERVAL)
}

async function queueValidatorCheck(client, registry, monitor) {
  setTimeout(async () => {
    const chains = await registry.getChains()
    await monitor.refreshValidators(client, chains)
    queueValidatorCheck(client, registry, monitor)
  }, VALIDATOR_REFRESH_INTERVAL)
}

async function queueChainCheck(client, registry, monitor) {
  setTimeout(async () => {
    const chains = await registry.getChains()
    await monitor.refreshChains(client, chains)
    queueChainCheck(client, registry, monitor)
  }, CHAIN_REFRESH_INTERVAL)
}

async function queueBlockCheck(client, registry, monitor) {
  setTimeout(async () => {
    const chains = await registry.getChains()
    await monitor.refreshChains(client, chains)
    queueBlockCheck(client, registry, monitor)
  }, CHAIN_REFRESH_INTERVAL)
}

(async () => {
  const client = await redisClient();

  const chainRepo = Repository(client, chainUrl, chainBranch, { exclude: ['testnets'] })
  const validatorRepo = Repository(client, validatorUrl, validatorBranch, { exclude: [], storeMeta: async (name, allData) => {
    await client.json.set([name, 'addresses'].join(':'), '$', allData.reduce((sum, validator) => {
      for(const chain of validator.chains.chains){
        sum[chain.address] = validator.path
      }
      return sum
    }, {}))
  } })
  await chainRepo.refresh()
  setInterval(() => chainRepo.refresh(), REPO_REFRESH_INTERVAL)

  await validatorRepo.refresh()
  setInterval(() => validatorRepo.refresh(), REPO_REFRESH_INTERVAL)

  const chainRegistry = ChainRegistry(client)
  const chains = await chainRegistry.getChains()

  const healthMonitor = HealthMonitor()
  await healthMonitor.refreshApis(client, chains)
  if (HEALTH_REFRESH_INTERVAL > 0) {
    queueHealthCheck(client, chainRegistry, healthMonitor)
  }

  const validatorMonitor = ValidatorMonitor()
  await validatorMonitor.refreshValidators(client, chains)
  if (VALIDATOR_REFRESH_INTERVAL > 0) {
    queueValidatorCheck(client, chainRegistry, validatorMonitor)
  }

  const chainMonitor = ChainMonitor()
  await chainMonitor.refreshChains(client, chains)
  if (CHAIN_REFRESH_INTERVAL > 0) {
    queueChainCheck(client, chainRegistry, chainMonitor)
  }

  const blockMonitor = BlockMonitor()
  await blockMonitor.refreshChains(client, chains)
  if (CHAIN_REFRESH_INTERVAL > 0) {
    queueBlockCheck(client, chainRegistry, blockMonitor)
  }
})();