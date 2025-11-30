import RpcClient from './client'
import RpcServer, { rpcResult } from './server'

export default {
  Client: RpcClient,
  Server: RpcServer,
  rpcResult,
}
export { rpcResult }
export type { RpcResult } from './server'
export type { RpcClient, RpcServer }

