import _ from "lodash"
import { timeStamp } from './utils.js';

const BEST_NODE_COUNT = 2
const BEST_HEIGHT_DIFF = 1
const BEST_RESPONSE_DIFF = 1

const ChainApis = (chainId, apis, monitor, previous) => {
  const urlTypes = ['rest', 'rpc']
  const current = retainUrls()
  let currentIndex = 1;

  function summary() {
    return urlTypes.reduce((sum, type) => {
      sum[type] = bestUrls(type);
      return sum;
    }, {});
  }

  function status() {
    return urlTypes.reduce((sum, type) => {
      const available = !!bestAddress(type)
      sum.available = sum.available === false ? false : available
      sum[type] = {
        available: available,
        best: bestUrls(type),
        current: current[type]
      }
      return sum
    }, {})
  }

  function bestAddress(type) {
    const urls = bestUrls(type).slice(0, BEST_NODE_COUNT);
    const cur = currentIndex % urls.length;
    currentIndex++;
    const best = urls[cur];
    return best && best.address.replace(/\/$|$/, '/');
  }

  function bestUrls(type) {
    const urls = orderedUrls(type);
    const best = urls[0];
    if (!best)
      return [];

    return urls.filter(el => {
      return el.blockHeight >= (best.blockHeight - BEST_HEIGHT_DIFF) && 
        el.responseTime >= (best.responseTime - BEST_RESPONSE_DIFF * 1000)
    }).map(el => el.url);
  }

  function orderedUrls(type) {
    const available = Object.values(current[type]).filter(el => el.available)
    return available.sort((a, b) => {
      return b.blockHeight - a.blockHeight || a.responseTime - b.responseTime
    });
  }

  function retainUrls() {
    return urlTypes.reduce((sum, type) => {
      if(!apis || !previous) return {...sum, [type]: {}}
      const newUrls = apis[type] || []
      const removed = Object.values(_.omit(previous[type], newUrls.map(el => el.address)))
      removed.map(url => { timeStamp('Removing', chainId, type, url.url, 'Removed from registry') })
      sum[type] = _.pick(previous[type], newUrls.map(el => el.address))
      return sum;
    }, {});
  }

  async function refreshUrls() {
    await Promise.all(urlTypes.map(async type => {
      const urls = apis[type] || [];
      await Promise.all(urls.map(async url => {
        if(monitor.pending(url.address)) return

        const currentUrl = current[type][url.address] || {}
        const urlData = await monitor.checkUrl(url, type, chainId, currentUrl)
        current[type][url.address] = urlData
      }));
    }));
  }

  return {
    current,
    bestAddress,
    bestUrls,
    refreshUrls,
    summary,
    status
  }
}

export default ChainApis
