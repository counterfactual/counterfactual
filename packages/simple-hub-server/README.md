# [Simple Hub Server](https://github.com/counterfactual/monorepo/packages/simple-hub-server) <img align="right" src="../../logo.svg" height="80px" />

The Simple Hub Server provides several services for the Playground, including:

- _Account login and registration_
- _Matchmaking_, used to provide a multiplayer experience for the demo dApps.
- _Multisig creation_, to enable deposits on the onboarding flow

It also operates as an _intermediary Node_ between peers.

## Usage

Successfully running the server requires 2 steps:

- Funding the server's ETH account: The server must have access to funds which it uses to deploy multisignature wallet contracts and collateralize channels. To fund the server, follow the [funding](#Funding-the-Hub-Account-for-Playground-Testing) instructions.
- Having a relational database to store users connecting to the Simple Hub Server. If you have a database already running, you can set its connection string via `DB_CONNECTION_STRING` as an environment variable for the Simple Hub Server to connect to. For example, the default connection string used is

```
postgresql://postgres@localhost:5432/postgres
```

If no database is locally running, you can either [install Postgres](https://www.postgresql.org) or if you're already running Docker, in `packages/simple-hub-server` simply execute

```
docker-compose up
```

which will start a Postgres instance for you and expose it on port 5432.

The database gets auto-configured with the right schema if the appopriate table doesn't exist.

- (Optional) By default the local in-memory Firebase instance is volatile which means that all open channels will have to be re-created after `simple-hub-server` restarts. In order to enable persistency across restarts, export the environment variable `export PLAYGROUND_PERSISTENCE_ENABLED=true`

Once the database is up and running, the Simple Hub Server can be started by executing:

```shell
yarn start
```

If running the entire Playground (and not just the server), from the root of the monorepo, execute:

```shell
yarn run:playground
```

You'll need a database (local or remote) to store account data there. By default, we recommend using [PostgreSQL](https://www.postgresql.org/), but since we connect to it via [Knex](http://knexjs.org), you can configure any database you want.

## Testing

You can run tests at any time using:

```shell
yarn test
```

Instead of using the regular PostgreSQL database, the test scope uses a volatile SQLite DB. Keep in mind that any schema changes you do on the real DB, you'll need to apply them to the SQLite schema creation as well.

## Environment settings

Unlike other packages, the Server relies on a [`.env-cmdrc`](./.env-cmdrc) which allows to configure multiple environments in the same file. See [env-cmd](https://www.npmjs.com/package/env-cmd#rc-file-usage)'s reference for more information on how it works.

## Funding the Hub Account for Playground Testing

### Where do I send Kovan ETH for testing?

First of all, you need to generate a mnemonic:

```node
$ node
> const ethers = require("ethers")
> ethers.utils.HDNode.fromMnemonic(ethers.Wallet.createRandom().mnemonic).extendedKey
'xprv9s21ZrQH143K3n6GUhRTVqwyqEVVy4KBPy5dXSdNCg1L1PDSJHqzQJKrXV7rYdYJLjnkHLvcGtkUtVdUD5rCbfpEpxa8sdfe8PmQtETuBcY'
```

And save it in `.env` in the format specified in `.env.schema`.

**Option 1** Compute the address:

```node
$ node
> const ethers = require("ethers")
> const xprv = ethers.utils.HDNode.fromMnemonic(ethers.Wallet.createRandom().mnemonic).extendedKey
> ethers.utils.HDNode.fromExtendedKey(xprv).derivePath("m/44'/60'/0'/25446").address
'0x84D1C440f73DD5c20fA9a3a7CB8A24D5F70a753c'
```

**Option 2** Read the logs of `simple-hub-server` when running it:

```
@counterfactual/simple-hub-server: Node signer address: 0x84D1C440f73DD5c20fA9a3a7CB8A24D5F70a753c
```
