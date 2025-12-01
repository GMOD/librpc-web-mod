// @ts-nocheck
import { expect, test } from 'vitest'
import { EventEmitter } from 'events'

import { RpcClient, RpcServer } from '../src/index.ts'

class EventTarget extends EventEmitter {
  addEventListener(event, listener) {
    this.on(event, listener)
  }
}

global.self = new EventTarget()
global.self.postMessage = function (data, transferables) {
  global.self.lastTransferables = transferables
  global.worker.emit('message', { data })
}

global.worker = new EventTarget()
global.worker.postMessage = function (data) {
  global.self.emit('message', { data })
}

function wait(time) {
  return new Promise(resolve => setTimeout(resolve, time))
}

const server = new RpcServer({
  add({ x, y }) {
    return x + y
  },
  task() {
    return wait(1000).then(() => 'done')
  },
  error() {
    return err
  },
  transfer(buffer) {
    return { buffer }
  },
})

const client = new RpcClient(global.worker)

test('RpcServer.constructor()', () => {
  expect(server instanceof RpcServer).toBeTruthy()
  expect(Object.keys(server.methods)).toEqual([
    'add',
    'task',
    'error',
    'transfer',
  ])
  expect(global.self.eventNames()).toEqual(['message'])
})

test('RpcServer.emit()', () => {
  function listener(data) {
    expect(data).toEqual({ foo: 'bar' })
  }
  client.on('event', listener)
  server.emit('event', { foo: 'bar' })
  client.off('event', listener)
  server.emit('event', { foo: 'bar' })
})

test('RpcClient.constructor()', () => {
  expect(client instanceof RpcClient).toBeTruthy()
  expect(global.worker.eventNames()).toEqual(['message', 'error'])
  global.worker.emit('error', {
    message: 'Some error',
    lineno: 42,
    filename: 'worker.js',
  })
})

test('RpcClient.call()', async () => {
  const result = await client.call('add', { x: 1, y: 1 })
  expect(result).toBe(2)
  await expect(() => client.call('length')).rejects.toThrow()
  await expect(() => client.call('error')).rejects.toThrow('err is not defined')

  const buffer = new ArrayBuffer(0xff)

  const r = await client.call('transfer', buffer)
  expect(r.buffer).toEqual(buffer)
})

test('peekTransferables auto-detects transferables in response', async () => {
  const buffer = new ArrayBuffer(0xff)
  await client.call('transfer', buffer)
  expect(global.self.lastTransferables).toEqual([buffer])
})
