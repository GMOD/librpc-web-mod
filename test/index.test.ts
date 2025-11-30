// @ts-nocheck
import { expect, test } from 'vitest'
import { EventEmitter } from 'events'

import { Client, Server } from '../src/index.ts'

class EventTarget extends EventEmitter {
  addEventListener(event, listener) {
    this.on(event, listener)
  }
}

global.self = new EventTarget()
global.self.postMessage = function (data) {
  global.worker.emit('message', { data })
}

global.worker = new EventTarget()
global.worker.postMessage = function (data) {
  global.self.emit('message', { data })
}

function wait(time) {
  return new Promise(resolve => setTimeout(resolve, time))
}

const server = new Server({
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

const client = new Client(global.worker)

test('Server.constructor()', () => {
  expect(server instanceof Server).toBeTruthy()
  expect(Object.keys(server.methods)).toEqual([
    'add',
    'task',
    'error',
    'transfer',
  ])
  expect(global.self.eventNames()).toEqual(['message'])
})

test('Server.emit()', () => {
  function listener(data) {
    expect(data).toEqual({ foo: 'bar' })
  }
  client.on('event', listener)
  server.emit('event', { foo: 'bar' })
  client.off('event', listener)
  server.emit('event', { foo: 'bar' })
})

test('Client.constructor()', () => {
  expect(client instanceof Client).toBeTruthy()
  expect(global.worker.eventNames()).toEqual(['message', 'error'])
  global.worker.emit('error', {
    message: 'Some error',
    lineno: 42,
    filename: 'worker.js',
  })
})

test('Client.call()', async () => {
  const result = await client.call('add', { x: 1, y: 1 })
  expect(result).toBe(2)
  await expect(() => client.call('length')).rejects.toThrow()
  await expect(() =>
    client.call('task', null, { timeout: 100 }),
  ).rejects.toThrow()
  await expect(() => client.call('error')).rejects.toThrow('err is not defined')

  const buffer = new ArrayBuffer(0xff)

  const r = await client.call('transfer', buffer)
  expect(r.buffer).toEqual(buffer)
})
