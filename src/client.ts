import { deserializeError } from './serializeError/index.ts'

import EventEmitter from './ee.ts'

interface RpcMessageData {
  uid: string
  libRpc?: true
  error?: string
  method?: string
  eventName?: string
  data: unknown
}

let counter = 0

export default class RpcClient extends EventEmitter {
  protected calls = new Map<string, (data: unknown) => void>()
  protected errors = new Map<string, (error: Error) => void>()

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
    const errorFn = this.errors.get(uid)
    if (errorFn) {
      errorFn(deserializeError(error))
      this.clear(uid)
    }
  }

  protected resolve(uid: string, data: unknown) {
    const callFn = this.calls.get(uid)
    if (callFn) {
      callFn(data)
      this.clear(uid)
    }
  }

  protected clear(uid: string) {
    this.calls.delete(uid)
    this.errors.delete(uid)
  }

  call(
    method: string,
    data: unknown,
    { transferables = [] }: { transferables?: Transferable[] } = {},
  ) {
    const uid = String(++counter)
    return new Promise((resolve, reject) => {
      this.calls.set(uid, resolve)
      this.errors.set(uid, reject)
      this.worker.postMessage({ method, uid, data, libRpc: true }, transferables)
    })
  }
}
