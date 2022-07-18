import PQueue from 'p-queue';
import got from 'got';
import _ from 'lodash'
import Agent from 'agentkeepalive'
import { debugLog, executeSync, timeStamp } from '../utils.js';

function ValidatorImageMonitor() {
  const agent = {
    http: new Agent({ maxSockets: 200 }),
    https: new Agent.HttpsAgent({ maxSockets: 200 })
  }
  const queue = new PQueue({ concurrency: 2 });

  async function refreshValidatorImages(client, chains) {
    timeStamp('Running validator image update');
    await Promise.all([...chains].map(async (chain) => {
      const current = await client.json.get('validators:' + chain.path, '$') || {}
      await updateValidatorImages(client, chain.path, current.validators || {});
      debugLog(chain.path, 'Validator image update complete')
    }));
    debugLog('Validator image update complete')
  }

  function updateValidatorImages(client, path, current) {
    const request = async () => {
      try {
        const calls = Object.entries(current).map(([address, validator]) => {
          return async () => {
            try {
              const mintscan_image = `https://raw.githubusercontent.com/cosmostation/cosmostation_token_resource/master/moniker/${path}/${address}.png`
              await got.get(mintscan_image, {
                timeout: { request: 5000 },
                retry: { limit: 1 },
                agent: agent
              })
              await client.json.set('validators:' + path, '$.validators.' + address + '.mintscan_image', mintscan_image);
            } catch { }
            if (validator.description.identity) {
              try {
                const response = await got.get("https://keybase.io/_/api/1.0/user/lookup.json?fields=pictures&key_suffix=" + validator.description.identity, {
                  timeout: { request: 5000 },
                  retry: { limit: 1 },
                  agent: agent
                })
                if (response && response.body) {
                  const data = JSON.parse(response.body)
                  if (data.them && data.them[0] && data.them[0].pictures) {
                    await client.json.set('validators:' + path, '$.validators.' + address + '.keybase_image', data.them[0].pictures.primary?.url);
                  }
                }
              } catch (e) {
                debugLog('Keybase failed', validator.operator_address, e.message)
              }
            }
          }
        })
        await executeSync(calls, 10)
      } catch (error) {
        timeStamp(path, 'Validator image update failed', error.message)
      }
    };
    return queue.add(request, { identifier: path });
  }

  return {
    refreshValidatorImages
  };
}

export default ValidatorImageMonitor
