import PQueue from 'p-queue';
import _ from 'lodash'
import got from 'got'
import { createAgent, debugLog, timeStamp } from '../utils.js';
import { Client } from 'rpc-websockets'
import { UniqueQueue } from '../uniqueQueue.js'
import { MAX_BLOCKS } from '../validators/validatorRegistry.js';

function BlockMonitor() {
  const monitors = {}
  const agent = createAgent();
  const gotOpts = {
    timeout: { request: 5000 },
    retry: { limit: 3 },
    agent: agent
  }
  const queue = new PQueue({ concurrency: 20, queueClass: UniqueQueue });

  async function refreshChains(client, chains) {
    timeStamp('Running block update');
    [...chains].map((chain) => {
      const readMessage = function ({ data: message }) {
        message = JSON.parse(message);
        if (message.result?.data?.type === 'tendermint/event/NewBlock') {
          return setCurrentBlock(client, chain, message.result.data.value.block);
        }
      }

      const request = async () => {
        const apis = await chain.apis('rpc')
        const rpcUrl = apis.bestAddress('rpc')
        if (!rpcUrl){
          timeStamp(chain.path, 'No available RPC API for websocket, attempting manual fetch')
          const restUrl = apis.bestAddress('rest')
          if(!restUrl) return timeStamp(chain.path, 'No available REST API')
          return fetchCurrentBlock(client, chain)
        }

        let monitor = monitors[chain.path]
        if (monitor) {
          const reconnecting = monitor.reconnect && (monitor.max_reconnects > monitor.current_reconnects)
          if((monitor.ready && monitor.socket) || reconnecting){
            return
          }else{
            monitor.socket?.removeEventListener("message", readMessage)
            try {
              monitor.close()
            } catch { }
          }
        }

        debugLog(chain.path, 'Websocket connecting')
        const url = rpcUrl.replace('http', 'ws') + 'websocket'
        let ws = new Client(url, { reconnect: true, max_reconnects: 3 })
        monitors[chain.path] = ws
        ws.on('open', function () {
          ws.call('subscribe', { query: "tm.event='NewBlock'" })

          ws.socket.addEventListener("message", readMessage)
        })
        ws.on('error', function(error){
          debugLog(chain.path, url, error.message)
          const failed = !ws.reconnect || (ws.max_reconnects <= ws.current_reconnects + 1)
          if(failed){
            timeStamp(chain.path, 'Websocket failed, fetching latest block manually')
            fetchCurrentBlock(client, chain)
          }
        })
      };
      return queue.add(request, { identifier: chain.path });
    });
    debugLog('Block update queued')
  }

  async function fetchCurrentBlock(client, chain){
    try {
      const restUrl = await getRestUrl(chain)
      const block = await got.get(`${restUrl}blocks/latest`, gotOpts).json()
      await setCurrentBlock(client, chain, block.block, restUrl)
    } catch (error) {
      timeStamp(chain.path, 'Block update failed', error.message)
    }
  }

  async function setCurrentBlock(client, chain, block, restUrl){
    try {
      const height = block.header.height
      const processed = await setBlock(client, chain, block)
      await client.json.set(`blocks:${chain.path}`, '$', processed)
      await fetchBlock(client, chain, height, height - 1, restUrl)
    } catch (error) {
      timeStamp(chain.path, 'Block update failed', error.message)
    }
  }

  async function fetchBlock(client, chain, currentHeight, height, restUrl){
    let block = await client.json.get(`blocks:${chain.path}#${height}`, '$')
    if(!block){
      debugLog(chain.path, 'Fetching height', height)
      if(!restUrl){
        restUrl = await getRestUrl(chain)
      }
      block = await got.get(`${restUrl}blocks/${height}`, gotOpts).json()
      await setBlock(client, chain, block.block)
      if(currentHeight - height < MAX_BLOCKS){
        return fetchBlock(client, chain, currentHeight, height - 1, restUrl)
      }
    }
  }

  async function setBlock(client, chain, block) {
    const processed = processBlock(block)
    debugLog(chain.path, 'Caching height', processed.height)
    await client.json.set(`blocks:${chain.path}#${processed.height}`, '$', processed)
    await client.expire(`blocks:${chain.path}#${processed.height}`, 60 * 60)
    return processed
  }

  function processBlock(block) {
    const { height, time } = block.header;
    const { signatures } = block.last_commit;
    return {
      height: parseInt(height),
      time,
      signatures: signatures.map(signature => {
        return signature.validator_address
      })
    };
  }

  async function getRestUrl(chain){
    const apis = await chain.apis('rest')
    const restUrl = apis.bestAddress('rest')
    if (!restUrl) throw new Error('No available REST API')

    return restUrl
  }

  return {
    refreshChains
  }
}

export default BlockMonitor
