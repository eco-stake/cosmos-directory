import Bugsnag from "@bugsnag/js"
import ChainRegistry from './chains/chainRegistry.js';
import { redisClient } from "./redisClient.js";
import BlockMonitor from "./chains/blockMonitor.js";

const blockRefreshSeconds = parseInt(process.env.BLOCK_REFRESH || 15)

console.log("Using config:", {
  blockRefreshSeconds
})

if(process.env.BUGSNAG_KEY){
  Bugsnag.start({
    apiKey: process.env.BUGSNAG_KEY,
    enabledReleaseStages: ['production', 'staging'],
    releaseStage: process.env.NODE_ENV
  })
}

async function queueBlockCheck(client, registry, monitor) {
  setTimeout(async () => {
    const chains = await registry.getChains()
    await monitor.refreshChains(client, chains)
    queueBlockCheck(client, registry, monitor)
  }, 1000 * blockRefreshSeconds)
}

(async () => {
  const client = await redisClient();

  const chainRegistry = ChainRegistry(client)
  const chains = await chainRegistry.getChains()

  if (blockRefreshSeconds > 0) {
    const blockMonitor = BlockMonitor()
    blockMonitor.refreshChains(client, chains)
    queueBlockCheck(client, chainRegistry, blockMonitor)
  }
})();