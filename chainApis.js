import _ from "lodash"

const BEST_NODE_COUNT = 2
const BEST_HEIGHT_DIFF = 2
const BEST_RESPONSE_DIFF = 1

const ChainApis = (client, chainId, apis) => {
  let currentIndex = 1
  
  async function bestAddress(type) {
    const urls = await bestUrls(type).then(urls => urls.slice(0, BEST_NODE_COUNT))
    const cur = currentIndex % urls.length;
    currentIndex++;
    const best = urls[cur];
    return best && best.address.replace(/\/$|$/, '/');
  }

  async function bestUrls(type) {
    const urls = await orderedUrls(type).then(urls => urls.filter(el => el.available))
    const best = urls[0];
    if (!best)
      return [];

    return urls.filter(el => {
      return el.blockHeight >= (best.blockHeight - BEST_HEIGHT_DIFF) && 
        el.responseTime >= (best.responseTime - BEST_RESPONSE_DIFF * 1000)
    }).map(el => el.url);
  }

  async function orderedUrls(type) {
    const urls = Object.values(await current(type))
    return urls.sort((a, b) => {
      return b.blockHeight - a.blockHeight || a.responseTime - b.responseTime
    });
  }

  async function current(type) {
    if(!await client.exists('health:' + chainId)){
      await client.json.set('health:' + chainId, '$', {})
    }
    const currentUrls = await client.json.get('health:' + chainId, '$')
    return currentUrls[type] || {}
  }

  return {
    bestAddress,
    bestUrls,
    apis,
    current
  }
}

export default ChainApis
