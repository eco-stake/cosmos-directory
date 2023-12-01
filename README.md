# cosmos.directory

[cosmos.directory](https://cosmos.directory) is an open source data 'hub' for the Cosmos. The intention is to provide APIs and a UI to make multi-chain development easy, and encourage networks, validators and users to keep the data sources up to date. 

The project currently provides the following features, and the intention is to develop it further as more features are required by ECO Stake projects and the wider ecosystem.

- Live JSON API for data registries such as the [Chain Registry](https://github.com/cosmos/chain-registry) and [Validator Registry](https://github.com/eco-stake/validator-registry).
- RPC and REST proxies for the public APIs listed in the [Chain Registry](https://github.com/cosmos/chain-registry), with CORS support, health checking, load balancing and some minor caching.
- On-chain validators API to retrieve all on-chain validators quickly, decorated with additional attributes such as image URLs, rank and [Validator Registry](https://github.com/eco-stake/validator-registry) data.
- REST/RPC Status API to monitor and publish the health of the [Chain Registry](https://github.com/cosmos/chain-registry) public APIs.
- Basic UI to make it easy to access chain information, list validators, health status and highlight the cosmos.directory data sources.

**This is a work in progress and the project is evolving rapidly.**

## Components

The project consists of three main components. Each component can be run together, or individually. The backend is provided by Redis; so long as each service can access the same Redis server then it can be setup in a very distributed way.

Anyone can run a cosmos.directory data hub so they don't have to rely on ECO Stake's cosmos.directory API. The registry URLs are configurable, allowing completely custom registries to be used instead so long as the schema matches. The project could be used to build internal data hubs, testnet specific hubs etc.

### Worker

See [worker.js](./worker.js)

- Fetches the Registry repositories on a schedule and caches the data in Redis
- Monitors the APIs listed in Chain Registry, tracking availability, response times, block heights etc in Redis
- Monitors the on-chain validators and caches in Redis

### API

See [app.js](./app.js)

- Sensible JSON API access the registry data cached in Redis
- REST/RPC proxy endpoints to access the most suitable API at any given time, based on response times, block heights etc. Some minor caching is also carried out here to reduce load on the public APIs. These endpoints are accesible to any CORS origin which is a key requirement for browser based apps.
- Alternative Validators API to provide on-chain validators decorated with convenience attributes such as image URLs and Rank, and additional Validator Registry attributes such as REStake configuration.
- Status API to monitor public API availability.

### UI

See [eco-stake/cosmos-directory-ui](https://github.com/eco-stake/cosmos-directory-ui)

- Simple React App highlighting the cosmos.directory API data.
- Useful as a status page, validator listing and much more planned.

## API Documentation

The following APIs are currently available. Be warned that cosmos.directory is MVP so the API structure may change, but best effort will be made to keep it compatible now it's published. 

### rpc.cosmos.directory/{chain} / rest.cosmos.directory/{chain}

RPC and REST API proxies for each chain are available at [{api}.cosmos.directory/{chain}](https:/rpc.cosmos.directory/akash/status), so long as the chain has API URLs in the Chain Registry. The proxies will only use available servers, and will direct traffic to the fastest responding, most up-to-date node at the time of the request. 

The proxies are CORS enabled with no origin restrictions so can be used to access nodes directly from the browser. Some minor caching is applied to common REST queries, particularly those used by REStake. This helps reduce load on the nodes and the Redis cache is extremely fast. 

### chains.cosmos.directory

[Chain Registry](https://github.com/cosmos/chain-registry) JSON API, and additional endpoints decorated by Cosmos Directory.

#### [GET /](https://chains.cosmos.directory/)

Excerpt of data for all chains from Chain Registry. Useful for listing pages etc.

```json
// 20220407140843
// https://chains.cosmos.directory/

{
  "repository": {
    "url": "https://github.com/eco-stake/chain-registry",
    "branch": "cosmos-directory",
    "commit": "52b28d2c909dcf4f68af35b83fd058e5ee458d70",
    "timestamp": 1649336566
  },
  "chains": [
    {
      "name": "agoric",
      "path": "agoric",
      "chain_name": "agoric",
      "network_type": "mainnet",
      "pretty_name": "Agoric",
      "chain_id": "agoric-3",
      "status": "live",
      "symbol": "BLD",
      ...
    ...
}
```

#### [GET /{chain}](https://chains.cosmos.directory/osmosis)

Excerpt of data for a specific chain from Chain Registry. 

```json
// 20220407140828
// https://chains.cosmos.directory/osmosis

{
  "repository": {
    "url": "https://github.com/eco-stake/chain-registry",
    "branch": "cosmos-directory",
    "commit": "52b28d2c909dcf4f68af35b83fd058e5ee458d70",
    "timestamp": 1649336566
  },
  "chain": {
    "name": "osmosis",
    "path": "osmosis",
    "chain_name": "osmosis",
    "network_type": "mainnet",
    "pretty_name": "Osmosis",
    "chain_id": "osmosis-1",
    "status": "live",
    "symbol": "OSMO",
    ...
  }
}
```

#### [GET /{chain}/{dataset}](https://chains.cosmos.directory/akash/chain)

Data exactly as it appears in the [Chain Registry](https://github.com/cosmos/chain-registry/tree/master/akash). `{dataset}` is the file from the repository, e.g. `chain` or `assetlist.json` (.json extension is optional).

Cosmos.directory won't decorate these endpoints so they can be a direct API representation of the repository.

```json
// 20220407140933
// https://chains.cosmos.directory/akash/chain

{
  "$schema": "../chain.schema.json",
  "chain_name": "akash",
  "status": "live",
  "network_type": "mainnet",
  "pretty_name": "Akash",
  "chain_id": "akashnet-2",
  "bech32_prefix": "akash",
  "daemon_name": "akash",
  "node_home": "$HOME/.akash",
  "genesis": {
    "genesis_url": "https://raw.githubusercontent.com/ovrclk/net/master/mainnet/genesis.json"
  },
  "slip44": 118,
  ...
}
```

### validators.cosmos.directory

[Validator Registry](https://github.com/eco-stake/validator-registry) JSON API, and additional endpoints decorated by Cosmos Directory.

#### [GET /](https://validators.cosmos.directory/)

Excerpt of data for all validators from Validator Registry, decorated with Cosmos Directory data.

```json
/ 20220407142554
// https://validators.cosmos.directory/

{
  "repository": {
    "url": "https://github.com/eco-stake/validator-registry",
    "branch": "master",
    "commit": "2e5eaece8741a9c55e2aa249778fb3d8b09a5a7b",
    "timestamp": 1649336363
  },
  "validators": [
    {
      "path": "01node",
      "name": "01node",
      "identity": "7BDD4C2E94392626",
      "chains": [
        {
          "name": "cosmoshub",
          "address": "cosmosvaloper17mggn4znyeyg25wd7498qxl7r2jhgue8u4qjcq",
          "restake": "cosmos1ks0uf2zxgv6qjyzjwfvfxyv5vp2m6nk5f0a762"
        },
        ...
      ]
    }
  ]
}
```

#### [GET /{validator}](https://validators.cosmos.directory/ecostake)

Excerpt of data for a specific validator from Validator Registry. 

```json
// 20220407142726
// https://validators.cosmos.directory/ecostake

{
  "repository": {
    "url": "https://github.com/eco-stake/validator-registry",
    "branch": "master",
    "commit": "2e5eaece8741a9c55e2aa249778fb3d8b09a5a7b",
    "timestamp": 1649336363
  },
  "validator": {
    "path": "ecostake",
    "name": "ECO Stake 🌱",
    "identity": "5992A6D423A406D6",
    "chains": [
      {
        "name": "akash",
        "address": "akashvaloper1xgnd8aach3vawsl38snpydkng2nv8a4kqgs8hf",
        "restake": "akash1yxsmtnxdt6gxnaqrg0j0nudg7et2gqczud2r2v"
      },
      ...
    ]
  }
}
```

#### [GET /{validator}/{dataset}](https://validators.cosmos.directory/ecostake/profile)

Data exactly as it appears in the [Validator Registry](https://github.com/eco-stake/validator-registry/tree/master/ecostake). `{dataset}` is the file from the repository, e.g. `profile` or `chains.json` (.json extension is optional).

Cosmos.directory won't decorate these endpoints so they can be a direct API representation of the repository.

```json
// 20220407142911
// https://validators.cosmos.directory/ecostake/profile

{
  "name": "ECO Stake 🌱",
  "identity": "5992A6D423A406D6"
}
```

#### [GET /chains/{chain}](https://validators.cosmos.directory/chains/osmosis)

On-chain validator information decorated with Cosmos Directory data. The on-chain data is cached by Cosmos Directory so this endpoint is very performant, and includes data such as REStake attributes, image URLs (pre-resolved from Keybase), and more in the future. 

The on-chain validator attributes are returned as they would be from the REST API, so this should be a relatively drop-in replacement for an on-chain query. This endpoint is very useful and shows the kind of functionality cosmos.directory could provide in the future.

```json
// 20220407143145
// https://validators.cosmos.directory/chains/osmosis

{
  "name": "osmosis",
  "validators": [
    {
      "path": "ecostake",
      "name": "ECO Stake 🌱",
      "moniker": "ECO Stake 🌱",
      "identity": "5992A6D423A406D6",
      "address": "osmovaloper1u5v0m74mql5nzfx2yh43s2tke4mvzghr6m2n5t",
      "operator_address": "osmovaloper1u5v0m74mql5nzfx2yh43s2tke4mvzghr6m2n5t",
      "consensus_pubkey": {
        "@type": "/cosmos.crypto.ed25519.PubKey",
        "key": "b84FxoaG4k9IKQYNpzqH16nCA35zmAumrhtSPJvMIcc="
      },
      "jailed": false,
      "status": "BOND_STATUS_BONDED",
      "tokens": "393613891047",
      "delegator_shares": "393613891047.000000000000000000",
      "description": {
        "moniker": "ECO Stake 🌱",
        "identity": "5992A6D423A406D6",
        "website": "https://ecostake.com",
        "security_contact": "",
        "details": "ECO Stake is a new climate positive validator 🌱 Carbon neutral and 10% of profit is donated to causes chosen by delegators 🌍 Secure and reliable with 100% slash protection and a low commission rate 🛡"
      },
      "unbonding_height": "2788776",
      "unbonding_time": "2022-01-28T01:51:48.909057793Z",
      "commission": {
        "commission_rates": {
          "rate": "0.050000000000000000",
          "max_rate": "0.100000000000000000",
          "max_change_rate": "0.010000000000000000"
        },
        "update_time": "2022-01-07T15:45:55.693653771Z"
      },
      "min_self_delegation": "1000000",
      "rank": 54,
      "mintscan_image": "https://raw.githubusercontent.com/cosmostation/chainlist/main/chain/osmosis/moniker/osmovaloper1u5v0m74mql5nzfx2yh43s2tke4mvzghr6m2n5t.png",
      "keybase_image": "https://s3.amazonaws.com/keybase_processed_uploads/9d337c16fa39ef101c37131dbec2cf05_360_360.jpg",
      "restake": {
        "address": "osmo1yxsmtnxdt6gxnaqrg0j0nudg7et2gqczed559y",
        "run_time": [
          "09:00",
          "21:00"
        ],
        "minimum_reward": 1000
      }
    }
    ...
  ]
}
```
