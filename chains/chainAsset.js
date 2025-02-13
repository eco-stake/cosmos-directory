function ChainAsset(data) {
  const { name, description, symbol, coingecko_id, denom_units, prices } = data
  const base = data.denom_units.find(el => el.denom === data.base)
  const display = data.denom_units.find(el => el.denom === data.display)
  const logo_URIs = data.logo_URIs
  const image = logo_URIs?.svg || logo_URIs?.png

  return {
    name,
    description,
    symbol,
    denom: base?.denom,
    decimals: display?.exponent ?? 6,
    coingecko_id,
    base,
    display,
    denom_units,
    logo_URIs,
    image,
    prices
  }
}

export default ChainAsset
