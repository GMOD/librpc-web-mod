export { default as RpcClient } from './client.ts'
export { default as RpcServer, rpcResult } from './server.ts'
export type { RpcResult } from './server.ts'
export {
  deserializeError,
  isErrorLike,
  serializeError,
} from './serializeError/index.ts'
export type { ErrorObject } from './serializeError/index.ts'
