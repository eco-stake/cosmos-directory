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
      const readMessage = function ({ data: message }) {
        message = JSON.parse(message);
        if (message.result?.data?.type === 'tendermint/event/NewBlock') {
          return setBlock(client, chain, message.result.data.value.block);
        }
      }

      const request = async () => {
        const apis = await chain.apis('rpc')
        const rpcUrl = apis.bestAddress('rpc')
        if (!rpcUrl) return timeStamp(chain.path, 'No API URL')

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
