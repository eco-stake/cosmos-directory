import PQueue from 'p-queue';
import _ from 'lodash'
import { debugLog, timeStamp } from '../utils.js';
import { Client } from 'rpc-websockets'
import { UniqueQueue } from '../uniqueQueue.js'

function BlockMonitor() {
  const monitors = {}
  const queue = new PQueue({ concurrency: 20, queueClass: UniqueQueue });

  async function refreshChains(client, chains) {
    timeStamp('Running block update');
    [...chains].map((chain) => {
      const request = async () => {
        let monitor = monitors[chain.path]
        if(monitor) return

        debugLog(chain.path, 'Websocket connecting')
        const apis = await chain.apis('rpc')
        const rpcUrl = apis.bestAddress('rpc')
        if (!rpcUrl) return timeStamp(chain.path, 'No API URL')

        let ws = new Client(rpcUrl.replace('http', 'ws') + 'websocket')
        ws.on('open', function() {

          ws.call('subscribe', { query: "tm.event='NewBlock'" })

          ws.socket.addEventListener("message", ({data: message}) => {
            message = JSON.parse(message)
            if(message.result?.data?.type === 'tendermint/event/NewBlock'){
              return setBlock(client, chain, message.result.data.value.block)
            }
          })

          ws.on('close', function(){
            timeStamp(chain.path, 'Websocket closed')
            delete monitors[chain.path]
          })
        })
        monitors[chain.path] = ws
      };
      return queue.add(request, { identifier: chain.path });
    });
    debugLog('Block update queued')
  }

  async function setBlock(client, chain, block){
    try {
      const height = block.header.height
      debugLog(chain.path, 'Caching height', height)
      const processed = processBlock(block)
      await client.json.set(`blocks:${chain.path}`, '$', processed)
      await client.json.set(`blocks:${chain.path}#${height}`, '$', processed)
      await client.expire(`blocks:${chain.path}#${height}`, 60 * 60)
    } catch (error) {
      timeStamp(chain.path, 'Block update failed', error.message)
    }
  }

  function processBlock(block){
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

  return {
    refreshChains
  }
}

export default BlockMonitor
