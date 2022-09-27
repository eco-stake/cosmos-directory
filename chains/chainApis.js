import _ from "lodash"

const BEST_HEIGHT_DIFF = 5
const BEST_RESPONSE_DIFF = 1
const BEST_ERROR_DIFF = 5 * 60
const IGNORE_ERROR_DIFF = 60 * 60

function ChainApis(health) {
  function bestAddress(type) {
    let urls = Object.values(health[type] || {})
    if(type === 'rest'){
      urls = urls.concat(Object.values(health['private'] || {}))
    }
    const best = _.sample(prepareUrls(urls.filter(el => el.available)))
    return best && best.address
  }

  function bestServiceAddress(){
    const bestService = bestAddress('service')
    if (bestService) return bestService

    return bestAddress('rest')
  }

  function bestHeight(type) {
    let urls
    if(type){
      urls = []
      urls = urls.concat(Object.values(health[type] || {}))
    }else{
      urls = Object.values(health).reduce((sum, urls) => {
        return sum.concat(Object.values(urls))
      }, [])
    }
    return Math.max(...urls.map(el => el.blockHeight).filter(Number.isFinite))
  }

  function bestUrls(type) {
    let urls
    urls = Object.values(health[type] || {}).filter(el => el.available)
    return prepareUrls(urls)
  }

  function prepareUrls(urls){
    return filterUrls(urls).map(el => {
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
    return urls.sort((a, b) => {
      return a.responseTime - b.responseTime
    })
  }

  return {
    bestAddress,
    bestServiceAddress,
    bestUrls,
    bestHeight,
    health
  }
}

export default ChainApis
