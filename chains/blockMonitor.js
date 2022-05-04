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
        if (monitor) return

        const apis = await chain.apis('rpc')
        const rpcUrl = apis.bestAddress('rpc')
        if (!rpcUrl) return timeStamp(chain.path, 'No API URL')

        debugLog(chain.path, 'Websocket connecting')

        let ws = new Client(rpcUrl.replace('http', 'ws') + 'websocket', { reconnect: false })
        monitors[chain.path] = ws
        ws.on('open', function () {
          ws.call('subscribe', { query: "tm.event='NewBlock'" })

          const readMessage = function ({ data: message }) {
            message = JSON.parse(message);
            if (message.result?.data?.type === 'tendermint/event/NewBlock') {
              return setBlock(client, chain, message.result.data.value.block);
            }
          }
          ws.socket.addEventListener("message", readMessage)

          ws.on('close', function () {
            timeStamp(chain.path, 'Websocket closed')
            ws.socket?.removeEventListener("message", readMessage)
            delete monitors[chain.path]
          })
        })
      };
      return queue.add(request, { identifier: chain.path });
    });
    debugLog('Block update queued')
  }

  async function setBlock(client, chain, block) {
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

  return {
    refreshChains
  }
}

export default BlockMonitor
