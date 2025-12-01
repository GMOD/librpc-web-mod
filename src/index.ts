export { default as RpcClient } from './client.ts'
export { default as RpcServer, rpcResult } from './server.ts'
export type { RpcResult } from './server.ts'
export {
  deserializeError,
  serializeError,
  isErrorLike,
} from './serializeError/index.ts'
export type { ErrorObject } from './serializeError/index.ts'
