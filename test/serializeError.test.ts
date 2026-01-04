import { expect, test } from 'vitest'

import {
  serializeError,
  deserializeError,
} from '../src/serializeError/index.ts'
import { isErrorLike } from '../src/serializeError/index.ts'

test('main', () => {
  const serialized = serializeError(new Error('foo'))
  const properties = Object.keys(serialized)

  expect(properties.includes('name')).toBe(true)
  expect(properties.includes('stack')).toBe(true)
  expect(properties.includes('message')).toBe(true)
})

test('should destroy circular references', () => {
  const object: Record<string, unknown> = {}
  object.child = { parent: object }

  const serialized = serializeError(object)
  expect(typeof serialized).toBe('object')
  expect((serialized as { child: { parent: string } }).child.parent).toBe(
    '[Circular]',
  )
})

test('should not affect the original object', () => {
  const object: Record<string, unknown> = {}
  object.child = { parent: object }

  const serialized = serializeError(object)
  expect(serialized).not.toBe(object)
  expect((object.child as { parent: unknown }).parent).toBe(object)
})

test('should only destroy parent references', () => {
  const object: Record<string, unknown> = {}
  const common = { thing: object }
  object.one = { firstThing: common }
  object.two = { secondThing: common }

  const serialized = serializeError(object) as {
    one: { firstThing: { thing: unknown } }
    two: { secondThing: { thing: unknown } }
  }
  expect(typeof serialized.one.firstThing).toBe('object')
  expect(typeof serialized.two.secondThing).toBe('object')
  expect(serialized.one.firstThing.thing).toBe('[Circular]')
  expect(serialized.two.secondThing.thing).toBe('[Circular]')
})

test('should work on arrays', () => {
  const object: Record<string, unknown> = {}
  const common = [object]
  const x = [common]
  const y: unknown[] = [['test'], common]
  ;(y[0] as unknown[])[1] = y
  object.a = { x }
  object.b = { y }

  const serialized = serializeError(object) as {
    a: { x: unknown[][] }
    b: { y: unknown[][] }
  }
  expect(Array.isArray(serialized.a.x)).toBe(true)
  expect(serialized.a.x[0]![0]).toBe('[Circular]')
  expect(serialized.b.y[0]![0]).toBe('test')
  expect(serialized.b.y[1]![0]).toBe('[Circular]')
  expect(serialized.b.y[0]![1]).toBe('[Circular]')
})

test('should discard nested functions', () => {
  function a() {}
  function b() {}
  ;(a as unknown as { b: () => void }).b = b
  const object = { a }

  const serialized = serializeError(object)
  expect(serialized).toEqual({})
})

test('should drop functions', () => {
  function a() {}
  ;(a as unknown as { foo: string; b: () => void }).foo = 'bar;'
  ;(a as unknown as { foo: string; b: () => void }).b = a
  const object = { a }

  const serialized = serializeError(object)
  expect(serialized).toEqual({})
  expect(Object.hasOwn(serialized, 'a')).toBe(false)
})

test('should not access deep non-enumerable properties', () => {
  const error = new Error('some error')
  const object = {}
  Object.defineProperty(object, 'someProp', {
    enumerable: false,
    get() {
      throw new Error('some other error')
    },
  })
  ;(error as unknown as { object: object }).object = object
  expect(() => serializeError(error)).not.toThrow()
})

test('should serialize nested errors', () => {
  const error = new Error('outer error') as Error & { innerError: Error }
  error.innerError = new Error('inner error')

  const serialized = serializeError(error) as {
    message: string
    innerError: { name: string; message: string }
  }
  expect(serialized.message).toBe('outer error')
  expect(serialized.innerError.name).toBe('Error')
  expect(serialized.innerError.message).toBe('inner error')
  expect(serialized.innerError instanceof Error).toBe(false)
})

test('should serialize the cause property', () => {
  const error = new Error('outer error', {
    cause: new Error('inner error', {
      cause: new Error('deeper error'),
    }),
  })

  const serialized = serializeError(error) as {
    message: string
    cause: {
      name: string
      message: string
      cause: { name: string; message: string }
    }
  }
  expect(serialized.message).toBe('outer error')
  expect(serialized.cause.name).toBe('Error')
  expect(serialized.cause.message).toBe('inner error')
  expect(serialized.cause.cause.name).toBe('Error')
  expect(serialized.cause.cause.message).toBe('deeper error')
  expect(serialized.cause instanceof Error).toBe(false)
})

test('should serialize AggregateError', () => {
  const error = new AggregateError([new Error('inner error')])

  const serialized = serializeError(error) as {
    message: string
    errors: { name: string; message: string }[]
  }
  expect(serialized.message).toBe('')
  expect(Array.isArray(serialized.errors)).toBe(true)
  expect(serialized.errors[0]!.name).toBe('Error')
  expect(serialized.errors[0]!.message).toBe('inner error')
  expect(serialized.errors[0] instanceof Error).toBe(false)
})

test('should serialize non-error values to NonError', () => {
  const stringResult = serializeError('hello')
  expect(stringResult.name).toBe('NonError')
  expect(stringResult.message).toMatch(/^Non-error value:/)
  expect(stringResult.stack).toBeTruthy()

  const numberResult = serializeError(42)
  expect(numberResult.name).toBe('NonError')
  expect(numberResult.message).toMatch(/^Non-error value:/)
  expect(numberResult.stack).toBeTruthy()

  const booleanResult = serializeError(true)
  expect(booleanResult.name).toBe('NonError')
  expect(booleanResult.message).toMatch(/^Non-error value:/)
  expect(booleanResult.stack).toBeTruthy()

  const symbolResult = serializeError(Symbol('test'))
  expect(symbolResult.name).toBe('NonError')
  expect(symbolResult.message).toMatch(/^Non-error value:/)
  expect(symbolResult.stack).toBeTruthy()

  const bigIntResult = serializeError(BigInt(123))
  expect(bigIntResult.name).toBe('NonError')
  expect(bigIntResult.message).toMatch(/^Non-error value:/)
  expect(bigIntResult.stack).toBeTruthy()

  const functionResult = serializeError(() => {})
  expect(functionResult.name).toBe('NonError')
  expect(functionResult.message).toMatch(/^Non-error value:/)
  expect(functionResult.stack).toBeTruthy()

  const undefinedResult = serializeError(undefined)
  expect(undefinedResult.name).toBe('NonError')
  expect(undefinedResult.message).toMatch(/^Non-error value:/)
  expect(undefinedResult.stack).toBeTruthy()

  const nullResult = serializeError(null)
  expect(nullResult.name).toBe('NonError')
  expect(nullResult.message).toMatch(/^Non-error value:/)
  expect(nullResult.stack).toBeTruthy()
})

test('should deserialize non-error values to NonError', () => {
  const testValues = [null, 1, true, '123', [1], {}]
  for (const value of testValues) {
    const deserialized = deserializeError(value)
    expect(deserialized instanceof Error).toBe(true)
    expect(deserialized.constructor.name).toBe('NonError')
    expect(deserialized.message).toMatch(/^Non-error value:/)
  }
})

test('should ignore Error instance', () => {
  const originalError = new Error('test')
  const deserialized = deserializeError(originalError)
  expect(deserialized).toBe(originalError)
})

test('should deserialize error', () => {
  const deserialized = deserializeError({
    message: 'Stuff happened',
  })
  expect(deserialized instanceof Error).toBe(true)
  expect(deserialized.name).toBe('Error')
  expect(deserialized.message).toBe('Stuff happened')
})

test('should deserialize and preserve existing properties', () => {
  const deserialized = deserializeError({
    message: 'foo',
    customProperty: true,
  }) as Error & { customProperty: boolean }
  expect(deserialized instanceof Error).toBe(true)
  expect(deserialized.message).toBe('foo')
  expect(deserialized.customProperty).toBe(true)
})

test('should deserialize and preserve the Error constructor', () => {
  const deserialized = deserializeError({
    name: 'Error',
    message: 'foo',
  })
  expect(deserialized instanceof Error).toBe(true)
  expect(deserialized.message).toBe('foo')
})

test('should deserialize and preserve the TypeError constructor', () => {
  const deserialized = deserializeError({
    name: 'TypeError',
    message: 'foo',
  })
  expect(deserialized instanceof TypeError).toBe(true)
  expect(deserialized.message).toBe('foo')
})

test('should deserialize and preserve the RangeError constructor', () => {
  const deserialized = deserializeError({
    name: 'RangeError',
    message: 'foo',
  })
  expect(deserialized instanceof RangeError).toBe(true)
  expect(deserialized.message).toBe('foo')
})

test('should deserialize plain object', () => {
  const object = {
    message: 'error message',
    stack: 'at <anonymous>:1:13',
    name: 'name',
    code: 'code',
  }

  const deserialized = deserializeError(object) as Error & { code: string }
  expect(deserialized instanceof Error).toBe(true)
  expect(deserialized.message).toBe('error message')
  expect(deserialized.stack).toBe('at <anonymous>:1:13')
  expect(deserialized.name).toBe('name')
  expect(deserialized.code).toBe('code')
})

test('should deserialize errors on cause property', () => {
  const object = {
    message: 'error message',
    stack: 'at <anonymous>:1:13',
    name: 'name',
    code: 'code',
    cause: {
      message: 'source error message',
      stack: 'at <anonymous>:3:14',
      name: 'name',
      code: 'the apple',
    },
  }

  const deserialized = deserializeError(object) as Error & {
    code: string
    cause: Error & { code: string }
  }
  expect(deserialized.cause instanceof Error).toBe(true)
  expect(deserialized.cause.message).toBe('source error message')
  expect(deserialized.cause.stack).toBe('at <anonymous>:3:14')
  expect(deserialized.cause.name).toBe('name')
  expect(deserialized.cause.code).toBe('the apple')
})

test('should deserialize AggregateError', () => {
  const deserialized = deserializeError({
    name: 'AggregateError',
    message: '',
    errors: [{ name: 'Error', message: 'inner error', stack: '' }],
  }) as AggregateError
  expect(deserialized instanceof AggregateError).toBe(true)
  expect(deserialized.message).toBe('')
  expect(Array.isArray(deserialized.errors)).toBe(true)
  expect(deserialized.errors[0]!.message).toBe('inner error')
  expect(deserialized.errors[0] instanceof Error).toBe(true)
})

test('should serialize Date as ISO string', () => {
  const date = { date: new Date(0) }
  const serialized = serializeError(date)
  expect(serialized).toEqual({ date: '1970-01-01T00:00:00.000Z' })
})

test('should serialize custom error with .toJSON', () => {
  class CustomError extends Error {
    value: number
    constructor() {
      super('foo')
      this.name = this.constructor.name
      this.value = 10
    }

    toJSON() {
      return {
        message: this.message,
        amount: `$${this.value}`,
      }
    }
  }

  const error = new CustomError()
  const serialized = serializeError(error)
  expect(serialized).toEqual({
    message: 'foo',
    amount: '$10',
  })
  expect(serialized.stack).toBe(undefined)
})

test('should ignore .toJSON methods if set in the options', () => {
  class CustomError extends Error {
    value: number
    constructor() {
      super('foo')
      this.name = this.constructor.name
      this.value = 10
    }

    toJSON() {
      return {
        message: this.message,
        amount: `$${this.value}`,
      }
    }
  }

  const error = new CustomError()
  const serialized = serializeError(error, { useToJSON: false }) as {
    name: string
    message: string
    value: number
    stack: string
  }
  expect(serialized.name).toBe('CustomError')
  expect(serialized.message).toBe('foo')
  expect(serialized.value).toBe(10)
  expect(serialized.stack).toBeTruthy()
})

test('should serialize properties up to Options.maxDepth levels deep', () => {
  const error = new Error('errorMessage') as Error & {
    one: { two: { three: object } }
  }
  error.one = { two: { three: {} } }
  const { message, name, stack } = error

  const levelZero = serializeError(error, { maxDepth: 0 })
  expect(levelZero).toEqual({})

  const levelOne = serializeError(error, { maxDepth: 1 })
  expect(levelOne).toEqual({ message, name, stack, one: {} })

  const levelTwo = serializeError(error, { maxDepth: 2 })
  expect(levelTwo).toEqual({ message, name, stack, one: { two: {} } })

  const levelThree = serializeError(error, { maxDepth: 3 })
  expect(levelThree).toEqual({
    message,
    name,
    stack,
    one: { two: { three: {} } },
  })
})

test('should identify serialized errors', () => {
  expect(
    isErrorLike(
      serializeError(new Error("I'm missing more than just your body")),
    ),
  ).toBe(true)
  expect(isErrorLike(serializeError(new Error()))).toBe(true)
  expect(
    isErrorLike({
      name: 'Error',
      message: 'Is it too late now to say sorry',
      stack: 'at <anonymous>:3:14',
    }),
  ).toBe(true)

  expect(
    isErrorLike({
      name: 'Bluberricious pancakes',
      stack: 12,
      ingredients: 'Blueberry',
    }),
  ).toBe(false)

  expect(
    isErrorLike({
      name: 'Edwin Monton',
      message:
        "We've been trying to reach you about your car's extended warranty",
      medium: 'Glass bottle in ocean',
    }),
  ).toBe(false)
})
