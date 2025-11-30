/* eslint-env serviceworker */
import { ErrorObject, serializeError } from 'serialize-error'

export interface RpcResult {
  __rpcResult: true
  value: unknown
  transferables: Transferable[]
}

export function rpcResult(value: unknown, transferables: Transferable[]): RpcResult {
  return { __rpcResult: true, value, transferables }
}

type Procedure = (data: unknown) => Promise<unknown | RpcResult>

interface RpcMessageData {
  method: string
  uid: string
  libRpc: true
  data: unknown
}

function isRpcResult(value: unknown): value is RpcResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    '__rpcResult' in value &&
    (value as RpcResult).__rpcResult === true
  )
}

export default class RpcServer {
  protected methods: Record<string, Procedure>

  /**
   * Every passed method becomes remote procedure.
   * It can return Promise if it is needed.
   * Procedures can return either a plain value or { result, transferables }
   * to specify transferable objects explicitly.
   * Errors thrown by procedures would be handled by server.
   * @param methods - Dictionary of remote procedures
   * @example
   *
   * var server = new RpcServer({
   *   add ({ x, y }) { return x + y },
   *   getBuffer () {
   *     const buffer = new ArrayBuffer(1024)
   *     return { result: buffer, transferables: [buffer] }
   *   }
   * })
   */
  constructor(methods: Record<string, Procedure>) {
    this.methods = methods
    this.listen()
  }

  protected listen() {
    self.addEventListener('message', this.handler.bind(this))
  }

  protected handler(e: MessageEvent<RpcMessageData>) {
    const { libRpc, method, uid, data } = e.data

    if (!libRpc) {
      return
    }

    const methodFn = this.methods[method]
    if (methodFn) {
      Promise.resolve(data)
        .then(methodFn)
        .then(
          response => this.reply(uid, method, response),
          error => this.throw(uid, serializeError(error)),
        )
    } else {
      this.throw(uid, `Unknown RPC method "${method}"`)
    }
  }

  protected reply(uid: string, method: string, response: unknown) {
    try {
      if (isRpcResult(response)) {
        const { value, transferables } = response
        self.postMessage({ uid, method, data: value, libRpc: true }, transferables)
      } else {
        self.postMessage({ uid, method, data: response, libRpc: true })
      }
    } catch (e) {
      this.throw(uid, serializeError(e))
    }
  }

  protected throw(uid: string, error: ErrorObject | string) {
    self.postMessage({ uid, error, libRpc: true })
  }

  /**
   * Trigger server event
   * @param eventName - Event name
   * @param data - Any data
   * @param transferables - Optional array of transferable objects
   */
  emit(eventName: string, data: unknown, transferables: Transferable[] = []) {
    self.postMessage({ eventName, data, libRpc: true }, transferables)
  }
}

