import PQueue from 'p-queue';
import got from 'got';
import _ from 'lodash'
import { timeStamp } from '../utils.js';

const ALLOWED_DELAY = 5 * 60
const ALLOWED_ERRORS = 2
const ERROR_COOLDOWN = 5 * 60

class MonitorQueue {
	constructor() {
		this._queue = [];
	}

	enqueue(run, options) {
    const runData = {
      address: options.address,
      run: run
    }
    return this._queue.push(runData);
	}

	dequeue() {
		const job = this._queue.shift()
    return job.run;
	}

	get size() {
		return this._queue.length;
	}

	filter(options) {
		return this._queue.filter(el => el.address === options.address);
	}
}

function HealthMonitor() {
  const queue = new PQueue({ concurrency: 20, queueClass: MonitorQueue });

  function pending(address) {
    return queue.sizeBy({ address }) > 0;
  }

  async function refreshApis(client, chains) {
    timeStamp('Refreshing APIs');
    await Promise.all([...chains].map(async (chain) => {
      const apis = chain.apis
      await Promise.all(['rpc', 'rest'].map(async (type) => {
        const urls = apis.apis[type] || [];
        const current = await apis.current(type);
        const updated = await Promise.all([...urls].map(async (url) => {
          if (pending(url.address))
            return;

          const currentUrl = current[url.address];
          return await checkUrl(url, type, chain.chainId, { ...currentUrl });
        }));
        await client.json.set('health:' + chain.chainId, '$.' + type, updated.reduce((sum, url) => {
          if (!url)
            return sum;
          sum[url.url.address] = url;
          return sum;
        }, {}));
      }));
    }));
    timeStamp('Refreshed APIs');
  }

  function checkUrl(url, type, chainId, currentUrl) {
    const request = async () => {
      try {
        const response = await got.get(url.address + '/' + urlPath(type), {
          timeout: { request: 5000 },
          retry: { limit: 1 }
        });
        const { timings, body } = response;
        const data = JSON.parse(body);
        return buildUrl(type, chainId, url, currentUrl, data, timings.phases.total);
      } catch (error) {
        const { timings, message } = error;
        return buildUrl(type, chainId, url, currentUrl, undefined, timings.phases.total, message);
      }
    };
    return queue.add(request, { address: url.address });
  }

  function urlPath(type) {
    return type === 'rest' ? 'blocks/latest' : 'block';
  }

  function buildUrl(type, chainId, url, currentUrl, data, responseTime, error) {
    let blockTime, blockHeight;
    if (!error) {
      ({ error, blockTime, blockHeight } = checkHeader(type, data, chainId));
    }

    let { lastError, lastErrorAt, available } = currentUrl;
    let errorCount = currentUrl.errorCount || 0;
    if (error) {
      errorCount++;
      lastError = error;
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
      nowAvailable = !error || !!currentUrl.available;
    }
    if (available && !nowAvailable) {
      timeStamp('Removing', chainId, type, url.address, error);
    } else if (!available && nowAvailable) {
      timeStamp('Adding', chainId, type, url.address);
    } else if (available && error) {
      timeStamp('Failed', chainId, type, url.address, error);
    }

    return {
      url,
      lastError,
      lastErrorAt,
      errorCount,
      available: nowAvailable,
      blockHeight: blockHeight,
      blockTime: blockTime,
      responseTime
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

    return { blockTime, blockHeight, error: error };
  }

  return {
    refreshApis,
    pending
  };
}

export default HealthMonitor
