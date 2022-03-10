const ChainAsset = (data) => {
  const { name, display, symbol, coingecko_id } = data
  const base = data.denom_units.find(el => el.denom === data.base)
  const token = data.denom_units.find(el => el.denom === data.display)
  const logo_URIs = data.logo_URIs
  const image = logo_URIs && (logo_URIs.svg || logo_URIs.png)

  const summary = () => {
    return {
      name,
      symbol,
      coingecko_id,
      base,
      token,
      image
    }
  }

  return {
    name,
    display,
    symbol,
    coingecko_id,
    base,
    token,
    logo_URIs,
    image,
    summary
  }
}

module.exports = ChainAsset
