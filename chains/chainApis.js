import _ from "lodash"

const BEST_NODE_COUNT = 2
const BEST_HEIGHT_DIFF = 5
const BEST_RESPONSE_DIFF = 1
const BEST_ERROR_DIFF = 5 * 60
const IGNORE_ERROR_DIFF = 60 * 60

function ChainApis(client, path, apis) {
  async function bestAddress(type) {
    const urls = await bestUrls(type).then(urls => urls.slice(0, BEST_NODE_COUNT))
    const best = _.sample(urls)
    return best && best.address
  }

  async function bestUrls(type) {
    let urls = Object.values(await current(type)).filter(el => el.available)
    const bestHeight = Math.max(...urls.map(el => el.blockHeight).filter(Number.isFinite))
    urls = urls.filter(el => {
      if (!el.blockHeight)
        return false

      return el.blockHeight >= (bestHeight - BEST_HEIGHT_DIFF)
    })
    const bestTime = Math.min(...urls.map(el => el.responseTime).filter(Number.isFinite))
    urls = urls.filter(el => {
      if (!el.responseTime)
        return false

      return el.responseTime <= (bestTime + BEST_RESPONSE_DIFF * 1000)
    })
    const bestErrors = Math.min(...urls.map(el => (el.lastErrorAt || 0)).filter(Number.isFinite))
    urls = urls.filter(el => {
      if (!el.lastErrorAt || el.lastErrorAt <= (Date.now() - IGNORE_ERROR_DIFF * 1000))
        return true

      return el.lastErrorAt <= (bestErrors + BEST_ERROR_DIFF * 1000)
    })
    return urls.sort((a, b) => {
      return a.responseTime - b.responseTime
    }).map(el => {
      const url = { ...el.url }
      url.address = el.finalAddress || url.address
      return url
    })
  }

  async function current(type) {
    if (!await client.exists('health:' + path)) {
      return {}
    }
    const currentUrls = await client.json.get('health:' + path, '$')
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
