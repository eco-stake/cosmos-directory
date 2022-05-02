import PQueue from 'p-queue';
import got from 'got';
import _ from 'lodash'
import Agent from 'agentkeepalive'
import { debugLog, timeStamp } from '../utils.js';
import { UniqueQueue } from '../uniqueQueue.js';

const STORE_BLOCKS=100

function BlockMonitor() {
  const agent = {
    http: new Agent({ maxSockets: 50 }),
    https: new Agent.HttpsAgent({ maxSockets: 50 })
  }
  const queue = new PQueue({ concurrency: 20, queueClass: UniqueQueue });

  async function refreshChains(client, chains) {
    timeStamp('Running block update');
    [...chains].map((chain) => {
      const request = async () => {
        const apis = await chain.apis('rest')
        const restUrl = apis.bestAddress('rest')
        if (!restUrl) return timeStamp(chain.path, 'No API URL')

        await updateChainBlocks(client, restUrl, chain);
        debugLog(chain.path, 'Block update complete')
      };
      return queue.add(request, { identifier: chain.path });
    });
    debugLog('Block update queued')
  }

  async function updateChainBlocks(client, restUrl, chain){
    try {
      const latestBlock = await got.get(restUrl + "/blocks/latest", {
        timeout: { request: 5000 },
        retry: { limit: 3 },
        agent: agent
      }).json();
      const latestHeight = latestBlock.block.header.height
      await client.json.set(`blocks:${chain.path}`, '$', processBlock(latestBlock))
      for (let i = 0; i < STORE_BLOCKS; i++) {
        const height = latestHeight - (i + 1);
        let block = await client.json.get(`blocks:${chain.path}#${height}`, '$')
        if(!block || !block.height){
          debugLog(chain.path, 'Caching height', height)
          const block = await got.get(restUrl + "/blocks/" + height, {
            timeout: { request: 5000 },
            retry: { limit: 3 },
            agent: agent
          }).json();
          await client.json.set(`blocks:${chain.path}#${height}`, '$', processBlock(block))
          await client.expire(`blocks:${chain.path}#${height}`, 60*60)
          await new Promise(r => setTimeout(r, 1 * 1000));
        }else{
          debugLog(chain.path, 'Already cached height', height)
        }
      }
    } catch (error) {
      timeStamp(chain.path, 'Block check failed', error.message)
    }
  }

  function processBlock(block){
    const { hash } = block.block_id;
    const { height, time } = block.block.header;
    const { signatures } = block.block.last_commit;
    return {
      hash,
      height: parseInt(height),
      time,
      signatures: signatures.map(signature => {
        return signature.validator_address
      })
    };
  }

  return {
    refreshChains
  }
}

export default BlockMonitor
