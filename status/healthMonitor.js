import PQueue from 'p-queue';
import got from 'got';
import _ from 'lodash'
import Agent from 'agentkeepalive'
import { timeStamp, debugLog } from '../utils.js';
import { UniqueQueue } from '../uniqueQueue.js';

const ALLOWED_DELAY = 10 * 60
const ALLOWED_ERRORS = 5
const ERROR_COOLDOWN = 10 * 60
const HEALTH_TIMEOUT = 5000

function HealthMonitor() {
  const agent = {
    http: new Agent({ maxSockets: 1 }),
    https: new Agent.HttpsAgent({ maxSockets: 1 })
  }
  const queue = new PQueue({ concurrency: 10, queueClass: UniqueQueue });

  function pending(address) {
    return queue.sizeBy({ address }) > 0;
  }

  async function refreshApis(client, chains) {
    timeStamp('Running health checks');
    await Promise.all([...chains].map(async (chain) => {
      const apis = await chain.apis()
      await Promise.all(['rpc', 'rest'].map(async (type) => {
        const urls = apis.apis[type] || [];
        const health = apis.health[type] || {};
        const updated = await Promise.all([...urls].map(async (url) => {
          if (pending(url.address)) return;

          const urlHealth = health[url.address];
          return await checkUrl(url, type, chain, { ...urlHealth });
        }));
        if(!await client.exists('health:' + chain.path)) await client.json.set('health:' + chain.path, '$', {})
        await client.json.set('health:' + chain.path, '$.' + type, updated.reduce((sum, url) => {
          if (!url)
            return sum;
          sum[url.url.address] = url;
          return sum;
        }, {}));
      }));
    }));
    debugLog('Health checks complete')
  }

  function checkUrl(url, type, chain, urlHealth) {
    const request = async () => {
      try {
        let address = new URL(url.address).href.replace(/\/$|$/, '/')
        const response = await got.get(address + urlPath(type), {
          timeout: { request: HEALTH_TIMEOUT },
          retry: { limit: 1 },
          agent: agent
        });
        return buildUrl(type, chain, url, urlHealth, response);
      } catch (error) {
        return buildUrl(type, chain, url, urlHealth, undefined, error);
      }
    };
    return queue.add(request, { identifier: url.address });
  }

  function urlPath(type) {
    return type === 'rest' ? 'blocks/latest' : 'block';
  }

  function buildUrl(type, chain, url, urlHealth, response, error) {
    let timings, body, data
    let blockTime = urlHealth?.blockTime
    let blockHeight = urlHealth?.blockHeight || 0;
    let finalAddress = urlHealth?.finalAddress
    if (!error) {
      ({ timings, body } = response)
      data = JSON.parse(body);
      const regex = new RegExp(`${urlPath(type)}/?$`)
      finalAddress = new URL(response.url).href.replace(regex, '').replace(/\/$|$/, '/');
      ({ error, blockTime, blockHeight } = checkHeader(type, data, chain.chainId));
    }else{
      ({ timings } = error)
    }
    const responseTime = timings?.phases?.total

    let { lastError, lastErrorAt, available } = urlHealth;
    let errorCount = urlHealth.errorCount || 0;
    if (error) {
      errorCount++;
      lastError = error.message;
      lastErrorAt = Date.now();
    } else if (errorCount > 0) {
      const currentTime = Date.now();
      const cooldownDate = (currentTime - 1000 * ERROR_COOLDOWN);
      if (lastErrorAt <= cooldownDate) {
        errorCount = 0;
      }
    }

    let nowAvailable = false;
    if (errorCount <= ALLOWED_ERRORS) {
      nowAvailable = !error || !!urlHealth.available;
    }
    if (available && !nowAvailable) {
      timeStamp('Removing', chain.path, type, url.address, error.message);
    } else if (!available && nowAvailable) {
      timeStamp('Adding', chain.path, type, url.address);
    } else if (available && error) {
      timeStamp('Failed', chain.path, type, url.address, error.message);
    }

    return {
      url,
      finalAddress,
      lastError,
      lastErrorAt,
      errorCount,
      available: nowAvailable,
      blockHeight: blockHeight,
      blockTime: blockTime,
      responseTime,
      lastCheck: Date.now()
    };
  }

  function checkHeader(type, data, chainId) {
    let error, blockTime;
    if (data && type === 'rpc')
      data = data.result;

    const header = data.block.header;
    if (header.chain_id !== chainId)
      error = 'Unexpected chain ID: ' + header.chain_id;

    blockTime = Date.parse(header.time);
    const currentTime = Date.now();
    if (!error && blockTime < (currentTime - 1000 * ALLOWED_DELAY))
      error = 'Unexpected block delay: ' + (currentTime - blockTime) / 1000;

    let blockHeight = parseInt(header.height);

    if(error) error = new Error(error)
    return { blockTime, blockHeight, error };
  }

  return {
    refreshApis,
    pending
  };
}

export default HealthMonitor
