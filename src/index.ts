import RpcClient from './client.ts'
import RpcServer, { rpcResult } from './server.ts'

export default {
  Client: RpcClient,
  Server: RpcServer,
  rpcResult,
}
export { rpcResult }
export type { RpcResult } from './server'
export type { RpcClient, RpcServer }
