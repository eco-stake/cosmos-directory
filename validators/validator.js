import _ from 'lodash'
import {
  toBase64, fromBase64, toHex, fromHex, Bech32
} from '@cosmjs/encoding'
import { sha256 } from '@cosmjs/crypto'
import { multiply, divide, pow } from 'mathjs'

export class Validator {
  constructor(chain, data, blocks, registryValidator){
    this.chain = chain
    this.data = data || {}
    this.registryValidator = registryValidator
    this.registryChain = registryValidator?.getChain(this.chain.path)
    this.path = this.registryValidator?.path
    this.name = this.registryValidator?.name
    this.address = this.data.operator_address || this.registryChain?.address
    this.moniker = this.data.description?.moniker
    this.identity = this.data.description?.identity || this.registryValidator?.profile?.identity
    this.active = this.data.status && this.data.status === 'BOND_STATUS_BONDED'
    this.restake = this.registryChain?.restake
    this.blocks = blocks || []
    this.commission = {
      ...this.data.commission,
      rate: this.data.commission && parseFloat(this.data.commission.commission_rates.rate)
    }
  }

  delegations(){
    const delegations = this.data.delegations
    if(!delegations?.total_tokens) return delegations || {}

    const asset = this.chain.baseAsset
    const price = asset?.prices?.coingecko
    if(!price) return delegations

    const total_tokens = delegations.total_tokens
    if(!total_tokens) return delegations

    const total_tokens_display = divide(total_tokens, pow(10, this.chain.decimals))
    const total_usd = price.usd && multiply(total_tokens_display, price.usd)
    return {
      ...this.data.delegations,
      total_tokens_display,
      total_usd
    }
  }

  hexAddress(){
    const pubKey = this.data.consensus_pubkey
    if(pubKey){
      const raw = sha256(fromBase64(pubKey.key))
      const address = toHex(raw).slice(0, 40).toUpperCase()
      return address
    }
  }

  consensusAddress(prefix){
    const pubKey = this.data.consensus_pubkey
    if(pubKey){
      prefix = prefix || this.chain.consensusPrefix
      const raw = sha256(fromBase64(pubKey.key))
      const address = Bech32.encode(prefix, raw.slice(0, 20));
      return address
    }
  }

  uptimePeriods(){
    return this.missedBlockPeriods().map(period => {
      return {
        blocks: period.blocks,
        uptime: (period.blocks - period.missed) / period.blocks
      }
    })
  }

  uptimePercentage(){
    return this.signedBlocks().length / this.blocks.length
  }

  missedBlockPeriods(){
    const periods = []
    if(this.blocks.length > 200){
      periods.push({
        blocks: 100,
        missed: 100 - this.signedBlocks(100).length
      })
    }
    if(this.blocks.length > 0){
      periods.push({
        blocks: this.blocks.length,
        missed: this.blocks.length - this.signedBlocks().length
      })
    }
    const chainParams = this.chain.params || {}
    const slashingPeriod = chainParams.slashing?.signed_blocks_window
    const slashingMissed = this.data.signing_info?.missed_blocks_counter
    if(slashingPeriod != undefined && slashingMissed != undefined){
      periods.push({
        blocks: parseInt(slashingPeriod),
        missed: parseInt(slashingMissed)
      })
    }
    return periods.sort((a, b) => {
      return a.blocks - b.blocks
    })
  }

  missedBlocks(max){
    const hexAddress = this.hexAddress()
    const base64Address = toBase64(fromHex(hexAddress))
    const blocks = this.blocks.filter(block => {
      return !block.signatures.find(el => [hexAddress, base64Address].includes(el))
    })
    return blocks.slice(0, max || blocks.length)
  }

  signedBlocks(max){
    const hexAddress = this.hexAddress()
    const base64Address = toBase64(fromHex(hexAddress))
    const blocks = this.blocks.filter(block => {
      return block.signatures.find(el => [hexAddress, base64Address].includes(el))
    })
    return blocks.slice(0, max || blocks.length)
  }

  publicNodes(){
    if(!this.path) return 

    const apis = this.chain.chain.apis
    return Object.keys(apis).reduce((sum, type) => {
      const owned = apis[type].filter(api => {
        if(!api.provider) return false

        return [this.path, _.startCase(this.path), this.name.trim()].includes(api.provider)
      })
      if (owned.length) {
        sum[type] = owned
      }
      return sum
    }, {})
  }

  privateNodes(){
    if(!this.path) return 

    return ['rpc', 'rest'].reduce((sum, type) => {
      const owned = this.chain.privateApis(type).filter(api => {
        if(!api.provider) return false

        return [this.path, _.startCase(this.path), this.name.trim()].includes(api.provider)
      })
      if (owned.length) {
        sum[type] = true
      }
      return sum
    }, {})
  }

  toJSON(mixedChains){
    const { path, name, moniker, identity, address, commission, restake, active } = this
    return {
      path: mixedChains === true ? this.chain.path : path,
      name: mixedChains === true ? this.chain.name : name,
      moniker,
      identity,
      address,
      active,
      hex_address: this.hexAddress(),
      ...this.data,
      image: this.data.mintscan_image || this.data.keybase_image,
      commission,
      restake,
      uptime: this.uptimePercentage(),
      uptime_periods: this.uptimePeriods(),
      missed_blocks: this.missedBlocks().length,
      missed_blocks_periods: this.missedBlockPeriods(),
      delegations: this.delegations(),
      public_nodes: this.publicNodes(),
      private_nodes: this.privateNodes()
    }
  }
}