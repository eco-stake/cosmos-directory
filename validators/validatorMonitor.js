import PQueue from 'p-queue';
import got from 'got';
import _ from 'lodash'
import Agent from 'agentkeepalive'
import { debugLog, executeSync, timeStamp } from '../utils.js';

const TIMEOUT = 20000

function ValidatorMonitor() {
  const agent = {
    http: new Agent({ maxSockets: 200 }),
    https: new Agent.HttpsAgent({ maxSockets: 200 })
  }
  const queue = new PQueue({ concurrency: 2 });

  async function refreshValidators(client, chains) {
    timeStamp('Running validator update');
    await Promise.all([...chains].map(async (chain) => {
      const apis = await chain.apis('rest')
      const url = apis.bestAddress('rest')
      if(!url) return timeStamp(chain.path, 'No API URL')

      const current = await client.json.get('validators:' + chain.path, '$') || {}

      let validators = await getAllValidators(url, chain.path, current.validators || {});
      if(!validators) return timeStamp(chain.path, 'Empty validator response')
      if(!validators.reduce) validators = Object.values(validators) // Agoric returns already keyed validators
      if(!validators.length) return timeStamp(chain.path, 'No validators')

      await client.json.set('validators:' + chain.path, '$', {
        chainId: chain.chainId,
        lastUpdated: Date.now(),
        validators: validators.reduce((sum, validator) => {
          sum[validator.operator_address] = validator;
          return sum;
        }, {})
      });
      debugLog(chain.path, 'Validator update complete')
    }));
    debugLog('Validator update complete')
  }

  function getAllValidators(url, path, current) {
    const request = async () => {
      try {
        const pages = await getAllPages((nextKey) => {
          return getValidators(url, 100, {}, nextKey);
        })
        const validators = pages.map((el) => el.validators).flat()
        const active = validators.filter(el => el.status === 'BOND_STATUS_BONDED').slice()
        const inactive = validators.filter(el => el.status !== 'BOND_STATUS_BONDED').slice()
        let i = 0;
        [active, inactive].forEach((group) => {
          group.sort((a, b) => {
            return parseInt(b.tokens) - parseInt(a.tokens)
          }).forEach((validator) => {
            validator.rank = ++i
          })
        })
        const calls = validators.map(validator => {
          return async () => {
            const currentValidator = current[validator.operator_address] || {}
            validator.mintscan_image = currentValidator.mintscan_image
            validator.keybase_image = currentValidator.keybase_image
            try {
              const mintscan_image = `https://raw.githubusercontent.com/cosmostation/cosmostation_token_resource/master/moniker/${path}/${validator.operator_address}.png`
              await got.get(mintscan_image, {
                timeout: { request: 5000 },
                retry: { limit: 1 },
                agent: agent
              })
              validator.mintscan_image = mintscan_image
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
                    validator.keybase_image = data.them[0].pictures.primary.url
                  }
                }
              } catch (e) {
                debugLog('Keybase failed', validator.operator_address, e.message)
              }
            }
          }
        })
        await executeSync(calls, 20)
        return validators.reduce(
          (a, v) => ({ ...a, [v.operator_address]: v }),
          {}
        );
      } catch (error) {
        timeStamp(path, 'Validator update failed', error.message)
      }
    };
    return queue.add(request, { identifier: path });
  }

  const getValidators = (url, pageSize, opts, nextKey) => {
    opts = opts || {}
    const searchParams = new URLSearchParams();
    if (opts.status) searchParams.append("status", opts.status);
    if (pageSize) searchParams.append("pagination.limit", pageSize);
    if (nextKey) searchParams.append("pagination.key", nextKey);
    return got.get(url +
      "cosmos/staking/v1beta1/validators?" +
      searchParams.toString(),
      {
        timeout: { request: TIMEOUT },
        retry: { limit: 3 },
        agent: agent
      });
  };

  const getAllPages = async (getPage) => {
    let pages = [];
    let nextKey
    do {
      const result = await getPage(nextKey);
      if(result && result.body){
        const json = JSON.parse(result.body)
        pages.push(json);
        nextKey = json.pagination?.next_key;
      }else{
        nextKey = undefined
      }
    } while (nextKey);
    return pages;
  };

  return {
    refreshValidators
  };
}

export default ValidatorMonitor
