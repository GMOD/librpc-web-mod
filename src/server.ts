import { ErrorObject, serializeError } from 'serialize-error'

function isTransferable(object: unknown): object is Transferable {
  try {
    return (
      object instanceof ArrayBuffer ||
      object instanceof ImageBitmap ||
      object instanceof OffscreenCanvas ||
      object instanceof MessagePort
    )
  } catch {
    return false
  }
}

function isObject(data: unknown): data is Record<string, unknown> {
  return Object(data) === data
}

function peekTransferables(data: unknown) {
  const result: Transferable[] = []
  if (isTransferable(data)) {
    result.push(data)
  } else if (isObject(data)) {
    for (const key in data) {
      const val = data[key]
      if (isTransferable(val)) {
        result.push(val)
      }
    }
  }
  return result
}

export interface RpcResult {
  __rpcResult: true
  value: unknown
  transferables: Transferable[]
}

export function rpcResult(
  value: unknown,
  transferables: Transferable[],
): RpcResult {
  return { __rpcResult: true, value, transferables }
}

type Procedure = (data: unknown) => Promise<unknown>

interface RpcMessageData {
  method: string
  uid: string
  libRpc?: true
  data: unknown
}

function isRpcResult(value: unknown): value is RpcResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    '__rpcResult' in value
  )
}

export default class RpcServer {
  protected methods: Record<string, Procedure>

  constructor(methods: Record<string, Procedure>) {
    this.methods = methods
    self.addEventListener('message', (e: MessageEvent<RpcMessageData>) => {
      this.handler(e)
    })
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
          response => {
            this.reply(uid, method, response)
          },
          (error: unknown) => {
            this.throw(uid, serializeError(error))
          },
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
        const transferables = peekTransferables(response)
        self.postMessage({ uid, method, data: response, libRpc: true }, transferables)
      }
    } catch (e) {
      this.throw(uid, serializeError(e))
    }
  }

  protected throw(uid: string, error: ErrorObject | string) {
    self.postMessage({ uid, error, libRpc: true })
  }

  emit(eventName: string, data: unknown, transferables?: Transferable[]) {
    const transfer = transferables ?? peekTransferables(data)
    self.postMessage({ eventName, data, libRpc: true }, transfer)
  }
}
