import {
  fromBase64, toHex, Bech32
} from '@cosmjs/encoding'
import { sha256 } from '@cosmjs/crypto'

export class Validator {
  constructor(chain, data, registryData, blocks){
    this.chain = chain
    this.data = data || {}
    this.registryData = registryData || {}
    this.address = this.data.operator_address || this.registryData.address
    this.moniker = this.data.description?.moniker
    this.identity = this.data.description?.identity || this.registryData.profile?.identity
    this.blocks = blocks || []
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
    periods.push({
      blocks: this.blocks.length,
      missed: this.blocks.length - this.signedBlocks().length
    })
    const chainParams = this.chain.params
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

  missedBlocks(){
    const hexAddress = this.hexAddress()
    return this.blocks.filter(block => {
      return !block.signatures.find(el => el === hexAddress)
    })
  }

  signedBlocks(){
    const hexAddress = this.hexAddress()
    return this.blocks.filter(block => {
      return block.signatures.find(el => el === hexAddress)
    })
  }

  toJSON(){
    const { moniker, identity, address } = this
    const { path, name } = this.registryData
    return {
      path,
      name,
      moniker,
      identity,
      address,
      hex_address: this.hexAddress(),
      uptime: this.uptimePercentage(),
      uptime_periods: this.uptimePeriods(),
      missed_blocks: this.missedBlocks().length,
      missed_blocks_periods: this.missedBlockPeriods(),
      // ..._.omit(this.registryData, 'name'),
      ...this.registryData,
      ...this.data
    }
  }
}