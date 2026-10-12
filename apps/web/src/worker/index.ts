import { expose } from 'comlink'
import { createApi } from '../lib/api'
import { Vault } from './vault'

// The worker that holds the keys (SEC-13). The page talks to it through Comlink.
expose(new Vault(createApi()))
