import _ from "lodash"

const BEST_HEIGHT_DIFF = 5
const BEST_RESPONSE_DIFF = 1
const BEST_ERROR_DIFF = 5 * 60
const IGNORE_ERROR_DIFF = 60 * 60

function ChainApis(health) {
  function bestAddress(type) {
    let urls = availableUrls(type)
    if(['rpc', 'rest'].includes(type)){
      urls = urls.concat(availableUrls(`private-${type}`))
    }
    const best = _.sample(prepareUrls(filterUrls(urls)))
    return best && best.address
  }

  function bestServiceAddress(){
    const bestService = bestAddress('service')
    if (bestService) return bestService

    return bestAddress('rest')
  }

  function bestHeight(type) {
    return Math.max(...availableUrls(type).map(el => el.blockHeight).filter(Number.isFinite))
  }

  function bestUrls(type) {
    return prepareUrls(filterUrls(availableUrls(type)))
  }

  function availableUrls(type) {
    return getUrls(type).filter(el => el.available)
  }

  function getUrls(type) {
    if(type){
      return Object.values(health[type] || {})
    }else{
      return Object.values(health).reduce((sum, urls) => {
        return sum.concat(Object.values(urls))
      }, [])
    }
  }

  function prepareUrls(urls){
    return urls.map(el => {
      const url = { ...el.url }
      url.address = el.finalAddress || url.address
      return url
    })
  }

  function filterUrls(urls){
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
    const withoutRateLimit = urls.filter(el => !el.rateLimited)
    if(withoutRateLimit.length){
      urls = withoutRateLimit
    }
    return urls.sort((a, b) => {
      return a.responseTime - b.responseTime
    })
  }

  return {
    bestAddress,
    bestServiceAddress,
    bestHeight,
    bestUrls,
    availableUrls,
    getUrls,
    health
  }
}

export default ChainApis
