import { deserializeError } from 'serialize-error'

import EventEmitter from './ee.ts'
import { uuid } from './utils.ts'

interface RpcMessageData {
  uid: string
  libRpc?: true
  error?: string
  method?: string
  eventName?: string
  data: unknown
}

export default class RpcClient extends EventEmitter {
  protected calls: Record<string, (data: unknown) => void> = {}
  protected timeouts: Record<string, NodeJS.Timeout> = {}
  protected errors: Record<string, (error: Error) => void> = {}

  constructor(public worker: Worker) {
    super()
    this.worker.addEventListener('message', (e: MessageEvent<RpcMessageData>) => {
      this.handler(e)
    })
    this.worker.addEventListener('error', (e: ErrorEvent) => {
      this.catch(e)
    })
  }

  protected handler(e: MessageEvent<RpcMessageData>) {
    const { uid, error, method, eventName, data, libRpc } = e.data
    if (!libRpc) {
      return
    }
    if (error) {
      this.reject(uid, error)
    } else if (method) {
      this.resolve(uid, data)
    } else if (eventName) {
      this.emit(eventName, data)
    }
  }

  protected catch(e: ErrorEvent) {
    this.emit('error', {
      message: e.message,
      lineno: e.lineno,
      filename: e.filename,
    })
  }

  protected reject(uid: string, error: string | Error) {
    const errorFn = this.errors[uid]
    if (errorFn) {
      errorFn(deserializeError(error))
      this.clear(uid)
    }
  }

  protected resolve(uid: string, data: unknown) {
    const callFn = this.calls[uid]
    if (callFn) {
      callFn(data)
      this.clear(uid)
    }
  }

  protected clear(uid: string) {
    const timeout = this.timeouts[uid]
    if (timeout) {
      clearTimeout(timeout)
    }
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete this.timeouts[uid]
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete this.calls[uid]
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete this.errors[uid]
  }

  call(
    method: string,
    data: unknown,
    {
      timeout = 2000,
      transferables = [],
    }: { timeout?: number; transferables?: Transferable[] } = {},
  ) {
    const uid = uuid()
    return new Promise((resolve, reject) => {
      this.timeouts[uid] = setTimeout(() => {
        this.reject(uid, new Error(`Timeout exceeded for RPC method "${method}"`))
      }, timeout)
      this.calls[uid] = resolve
      this.errors[uid] = reject
      this.worker.postMessage({ method, uid, data, libRpc: true }, transferables)
    })
  }
}
