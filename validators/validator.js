import {
  fromBase64, toHex, Bech32
} from '@cosmjs/encoding'
import { sha256 } from '@cosmjs/crypto'

export class Validator {
  constructor(data, registryData, blocks){
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
      const raw = sha256(fromBase64(pubKey.key))
      const address = Bech32.encode(prefix, raw.slice(0, 20));
      return address
    }
  }

  uptimePercentage(){
    return this.signedBlocks().length / this.blocks.length
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
      hexAddress: this.hexAddress(),
      uptime: this.uptimePercentage(),
      missedBlocks: this.missedBlocks().length,
      // ..._.omit(this.registryData, 'name'),
      ...this.registryData,
      ...this.data
    }
  }
}