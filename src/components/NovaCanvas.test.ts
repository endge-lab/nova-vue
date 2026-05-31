import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import { Nova, NovaNode, NovaSyncScope, RendererType, createNovaSyncPort, type NovaApp, type NovaSurface } from '@endge/nova'
import NovaCanvas from '@/components/NovaCanvas.vue'
import { NovaSyncLink } from '@/components/NovaSync'

const devtoolsDisposeMock = vi.hoisted(() => vi.fn())
const installNovaDevtoolsMock = vi.hoisted(() => vi.fn(() => devtoolsDisposeMock))

vi.mock('@endge/nova-devtools/runtime', () => ({
  installNovaDevtools: installNovaDevtoolsMock,
}))

/**
 * Описывает Nova-node TestCompiledNode и его runtime-поведение.
 */
class TestCompiledNode extends NovaNode<Record<string, any>> {
  static instances: Array<TestCompiledNode> = []

  props: Record<string, unknown>
  listeners: Record<string, (...args: Array<any>) => void>

  /**
   * Создает экземпляр TestCompiledNode и подготавливает базовое состояние.
   */
  constructor(
    app: NovaApp<Record<string, any>>,
    surface: NovaSurface<Record<string, any>>,
    props: Record<string, unknown> = {},
    listeners: Record<string, (...args: Array<any>) => void> = {},
  ) {
    super(app, surface)
    this.props = props
    this.listeners = listeners
    TestCompiledNode.instances.push(this)
  }

  /**
   * Обновляет значение состояния TestCompiledNode.
   */
  setProps(patch: Record<string, unknown>): this {
    this.props = {
      ...this.props,
      ...patch,
    }
    return this
  }

  /**
   * Обновляет значение состояния TestCompiledNode.
   */
  setListeners(listeners: Record<string, (...args: Array<any>) => void>): this {
    this.listeners = listeners
    return this
  }
}

/**
 * Описывает Nova-node ReplacementCompiledNode и его runtime-поведение.
 */
class ReplacementCompiledNode extends TestCompiledNode {}

describe('NovaCanvas', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    TestCompiledNode.instances = []
    devtoolsDisposeMock.mockClear()
    installNovaDevtoolsMock.mockClear()
    installCanvasMocks()
    installResizeObserverMock()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates runtime, mounts generated template and destroys app on unmount', async () => {
    const host = document.createElement('div')
    const ready = vi.fn()
    const destroy = vi.fn()
    const app = createApp({
      render: () => h(NovaCanvas, {
        width: 420,
        height: 360,
        padding: 20,
        background: '#0f172a',
        devtools: false,
        onReady: ready,
        onDestroy: destroy,
      }, {
        nova: () => h('nova-template', {
          component: TestCompiledNode,
          label: 'demo',
        }),
      }),
    })

    document.body.appendChild(host)
    app.mount(host)
    await nextTick()

    expect(ready).toHaveBeenCalledTimes(1)
    expect(TestCompiledNode.instances).toHaveLength(1)
    expect(TestCompiledNode.instances[0].props).toMatchObject({
      label: 'demo',
      width: 420,
      height: 360,
      padding: 20,
      background: '#0f172a',
    })

    app.unmount()

    expect(destroy).toHaveBeenCalledTimes(1)
    expect(TestCompiledNode.instances[0].lifecycleState).toBe('destroyed')
  })

  it('creates app-local sync scope by default and accepts optional shared syncScope', async () => {
    const host = document.createElement('div')
    const ready = vi.fn()
    const sharedScope = new NovaSyncScope({ id: 'vue-shared' })
    const app = createApp({
      render: () => h('section', [
        h(NovaCanvas, {
          width: 160,
          height: 120,
          devtools: false,
          onReady: ready,
        }, {
          nova: () => h('nova-template', { component: TestCompiledNode }),
        }),
        h(NovaCanvas, {
          width: 160,
          height: 120,
          devtools: false,
          syncScope: sharedScope,
          onReady: ready,
        }, {
          nova: () => h('nova-template', { component: TestCompiledNode }),
        }),
      ]),
    })

    document.body.appendChild(host)
    app.mount(host)
    await nextTick()

    expect(ready).toHaveBeenCalledTimes(2)
    const [localPayload, sharedPayload] = ready.mock.calls.map(call => call[0])
    expect(localPayload.app.sync).toBeInstanceOf(NovaSyncScope)
    expect(localPayload.app.sync).not.toBe(sharedScope)
    expect(sharedPayload.app.sync).toBe(sharedScope)

    app.unmount()
    sharedScope.dispose()
  })

  it('mounts, updates and disposes NovaSync.Link declaratively', async () => {
    const scope = new NovaSyncScope({ id: 'vue-link' })
    const source = { state: { value: 1 } }
    const targetA = { state: { value: 0 } }
    const targetB = { state: { value: 0 } }
    scope.registerNode({ componentId: 'source' } as never, {
      value: createNovaSyncPort({
        read: () => source.state.value,
        write: value => {
          source.state.value = Number(value)
        },
      }),
    })
    scope.registerNode({ componentId: 'target-a' } as never, {
      value: createNovaSyncPort({
        read: () => targetA.state.value,
        write: value => {
          targetA.state.value = Number(value)
        },
      }),
    })
    scope.registerNode({ componentId: 'target-b' } as never, {
      value: createNovaSyncPort({
        read: () => targetB.state.value,
        write: value => {
          targetB.state.value = Number(value)
        },
      }),
    })

    const to = ref('#target-a.value')
    const host = document.createElement('div')
    const app = createApp({
      setup: () => () => h(NovaSyncLink, {
        scope,
        from: '#source.value',
        to: to.value,
        transform: (value: unknown) => Number(value) + 1,
      }),
    })

    document.body.appendChild(host)
    app.mount(host)
    await nextTick()
    await nextTick()

    scope.notify('#source.value', 3)
    expect(targetA.state.value).toBe(4)
    expect(targetB.state.value).toBe(0)

    to.value = '#target-b.value'
    await nextTick()
    await nextTick()

    scope.notify('#source.value', 5)
    expect(targetA.state.value).toBe(4)
    expect(targetB.state.value).toBe(6)

    app.unmount()
    scope.notify('#source.value', 8)
    expect(targetB.state.value).toBe(6)
    scope.dispose()
  })

  it('updates measured width and height when host props change', async () => {
    const host = document.createElement('div')
    const width = ref(320)
    const height = ref(240)
    const app = createApp({
      setup: () => () => h(NovaCanvas, {
        width: width.value,
        height: height.value,
        devtools: false,
      }, {
        nova: () => h('nova-template', {
          component: TestCompiledNode,
        }),
      }),
    })

    document.body.appendChild(host)
    app.mount(host)
    await nextTick()

    expect(TestCompiledNode.instances[0].props.width).toBe(320)
    expect(TestCompiledNode.instances[0].props.height).toBe(240)

    width.value = 640
    height.value = 480
    await nextTick()

    expect(TestCompiledNode.instances[0].props.width).toBe(640)
    expect(TestCompiledNode.instances[0].props.height).toBe(480)

    app.unmount()
  })

  it('patches reactive marker props without recreating the root instance', async () => {
    const host = document.createElement('div')
    const label = ref('first')
    const app = createApp({
      setup: () => () => h(NovaCanvas, {
        width: 320,
        height: 240,
        devtools: false,
      }, {
        nova: () => h('nova-template', {
          component: TestCompiledNode,
          label: label.value,
          'initial-data': label.value,
        }),
      }),
    })

    document.body.appendChild(host)
    app.mount(host)
    await nextTick()

    const instance = TestCompiledNode.instances[0]
    expect(TestCompiledNode.instances).toHaveLength(1)
    expect(instance.props.label).toBe('first')
    expect(instance.props.initialData).toBe('first')

    const startedAt = performance.now()
    for (let index = 0; index < 1_000; index += 1) {
      label.value = `next-${index}`
      await nextTick()
    }
    const elapsed = performance.now() - startedAt

    expect(TestCompiledNode.instances).toHaveLength(1)
    expect(TestCompiledNode.instances[0]).toBe(instance)
    expect(instance.props.label).toBe('next-999')
    expect(instance.props.initialData).toBe('next-999')
    expect(elapsed).toBeLessThan(250)
    console.info(`[bench] nova-vue:reactive-marker-updates elapsed=${elapsed.toFixed(2)}ms budget=250ms rootInstances=${TestCompiledNode.instances.length}`)

    app.unmount()
  })

  it('patches NovaCanvas props bridge without recreating the mounted root', async () => {
    const host = document.createElement('div')
    const theme = ref('light')
    const app = createApp({
      setup: () => () => h(NovaCanvas, {
        width: 320,
        height: 240,
        props: { theme: theme.value },
        devtools: false,
      }, {
        nova: () => h('nova-template', {
          component: TestCompiledNode,
        }),
      }),
    })

    document.body.appendChild(host)
    app.mount(host)
    await nextTick()

    const instance = TestCompiledNode.instances[0]
    expect(instance.props.theme).toBe('light')

    theme.value = 'dark'
    await nextTick()

    expect(TestCompiledNode.instances).toHaveLength(1)
    expect(TestCompiledNode.instances[0]).toBe(instance)
    expect(instance.props.theme).toBe('dark')

    app.unmount()
  })

  it('updates listeners through the existing mount handle', async () => {
    const host = document.createElement('div')
    const listener = ref(vi.fn())
    const app = createApp({
      setup: () => () => h(NovaCanvas, {
        width: 320,
        height: 240,
        devtools: false,
      }, {
        nova: () => h('nova-template', {
          component: TestCompiledNode,
          onSelect: listener.value,
        }),
      }),
    })

    document.body.appendChild(host)
    app.mount(host)
    await nextTick()

    const instance = TestCompiledNode.instances[0]
    expect(instance.listeners.select).toBe(listener.value)

    const nextListener = vi.fn()
    listener.value = nextListener
    await nextTick()

    expect(TestCompiledNode.instances).toHaveLength(1)
    expect(instance.listeners.select).toBe(nextListener)

    app.unmount()
  })

  it('recreates the mounted root when generated constructor changes', async () => {
    const host = document.createElement('div')
    const component = ref<typeof TestCompiledNode | typeof ReplacementCompiledNode>(TestCompiledNode)
    const app = createApp({
      setup: () => () => h(NovaCanvas, {
        width: 320,
        height: 240,
      }, {
        nova: () => h('nova-template', {
          component: component.value,
        }),
      }),
    })

    document.body.appendChild(host)
    app.mount(host)
    await nextTick()

    const first = TestCompiledNode.instances[0]
    component.value = ReplacementCompiledNode
    await nextTick()

    expect(TestCompiledNode.instances).toHaveLength(2)
    expect(first.lifecycleState).toBe('destroyed')
    expect(TestCompiledNode.instances[1]).toBeInstanceOf(ReplacementCompiledNode)

    app.unmount()
  })

  it('passes nova refs into scope and root props', async () => {
    const host = document.createElement('div')
    const timeline = Nova.ref<Record<string, never>>('timeline')
    const ready = vi.fn()
    const app = createApp({
      render: () => h(NovaCanvas, {
        width: 320,
        height: 240,
        devtools: false,
        onReady: ready,
      }, {
        nova: () => h('nova-template', {
          component: TestCompiledNode,
          novaRefs: { timeline },
        }),
      }),
    })

    document.body.appendChild(host)
    app.mount(host)
    await nextTick()

    expect(ready).toHaveBeenCalledTimes(1)
    expect(ready.mock.calls[0][0].scope.refs.timeline).toBe(timeline)
    expect((TestCompiledNode.instances[0].props.novaRefs as Record<string, unknown>).timeline).toBe(timeline)

    app.unmount()
  })

  it('applies per-instance schema plugins before template mount', async () => {
    const host = document.createElement('div')
    const plugin = vi.fn()
    const app = createApp({
      render: () => h(NovaCanvas, {
        width: 320,
        height: 240,
        devtools: false,
        plugins: [plugin],
      }, {
        nova: () => h('nova-template', {
          component: TestCompiledNode,
        }),
      }),
    })

    document.body.appendChild(host)
    app.mount(host)
    await nextTick()

    expect(plugin).toHaveBeenCalledTimes(1)
    expect(plugin.mock.calls[0][0].has).toEqual(expect.any(Function))

    app.unmount()
  })

  it('registers NovaCanvas in devtools with explicit id and label and disposes it on unmount', async () => {
    const host = document.createElement('div')
    const app = createApp({
      render: () => h(NovaCanvas, {
        width: 320,
        height: 240,
        canvasLabel: 'Fallback label',
        devtools: {
          id: 'test-canvas',
          label: 'Test canvas',
        },
      }, {
        nova: () => h('nova-template', {
          component: TestCompiledNode,
        }),
      }),
    })

    document.body.appendChild(host)
    app.mount(host)
    await vi.dynamicImportSettled()

    expect(installNovaDevtoolsMock).toHaveBeenCalledTimes(1)
    expect(installNovaDevtoolsMock.mock.calls[0][1]).toEqual({
      id: 'test-canvas',
      label: 'Test canvas',
    })

    app.unmount()

    expect(devtoolsDisposeMock).toHaveBeenCalledTimes(1)
  })

  it('does not register devtools when devtools prop is disabled', async () => {
    const host = document.createElement('div')
    const app = createApp({
      render: () => h(NovaCanvas, {
        width: 320,
        height: 240,
        devtools: false,
      }, {
        nova: () => h('nova-template', {
          component: TestCompiledNode,
        }),
      }),
    })

    document.body.appendChild(host)
    app.mount(host)
    await vi.dynamicImportSettled()

    expect(installNovaDevtoolsMock).not.toHaveBeenCalled()

    app.unmount()
  })

  it('keeps one devtools registration across reactive marker updates', async () => {
    const host = document.createElement('div')
    const label = ref('first')
    const app = createApp({
      setup: () => () => h(NovaCanvas, {
        width: 320,
        height: 240,
        devtools: true,
      }, {
        nova: () => h('nova-template', {
          component: TestCompiledNode,
          label: label.value,
        }),
      }),
    })

    document.body.appendChild(host)
    app.mount(host)
    await vi.dynamicImportSettled()

    label.value = 'second'
    await nextTick()
    await vi.dynamicImportSettled()

    expect(installNovaDevtoolsMock).toHaveBeenCalledTimes(1)

    app.unmount()
    expect(devtoolsDisposeMock).toHaveBeenCalledTimes(1)
  })

  it('registers and disposes many devtools canvases under budget', async () => {
    const host = document.createElement('div')
    const canvasCount = 25
    const app = createApp({
      render: () => h('section', Array.from({ length: canvasCount }, (_item, index) => (
        h(NovaCanvas, {
          key: index,
          width: 80,
          height: 48,
          devtools: {
            id: `bench-canvas-${index}`,
            label: `Bench canvas ${index}`,
          },
        }, {
          nova: () => h('nova-template', {
            component: TestCompiledNode,
            label: `bench-${index}`,
          }),
        })
      ))),
    })

    document.body.appendChild(host)
    const startedAt = performance.now()
    app.mount(host)
    await vi.dynamicImportSettled()
    await nextTick()
    await vi.dynamicImportSettled()
    app.unmount()
    const elapsed = performance.now() - startedAt

    expect(TestCompiledNode.instances).toHaveLength(canvasCount)
    expect(installNovaDevtoolsMock).toHaveBeenCalledTimes(canvasCount)
    expect(devtoolsDisposeMock).toHaveBeenCalledTimes(canvasCount)
    expect(elapsed).toBeLessThan(220)
    console.info(`[bench] nova-vue:devtools-registration elapsed=${elapsed.toFixed(2)}ms budget=220ms canvases=${canvasCount}`)
  })
})

function installCanvasMocks(): void {
  Object.defineProperty(window, 'devicePixelRatio', {
    value: 2,
    configurable: true,
  })

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((type: string) => {
    if (type === RendererType.WebGL || type === 'webgl2' || type === 'webgl') {
      return createWebGLContextStub()
    }
    if (type !== RendererType.Web2D) return null
    return new Proxy({
      measureText: vi.fn((text: string) => ({ width: text.length * 8 })),
      createPattern: vi.fn(() => ({})),
    }, {
      /**
       * Возвращает значение состояния текущего класса.
       */
      get(target, property) {
        if (!(property in target)) {
          ;(target as Record<PropertyKey, unknown>)[property] = vi.fn()
        }
        return (target as Record<PropertyKey, unknown>)[property]
      },
      /**
       * Обновляет значение состояния текущего класса.
       */
      set(target, property, value) {
        ;(target as Record<PropertyKey, unknown>)[property] = value
        return true
      },
    }) as CanvasRenderingContext2D
  })
}

function createWebGLContextStub(): WebGL2RenderingContext {
  return new Proxy({
    canvas: document.createElement('canvas'),
    createBuffer: vi.fn(() => ({})),
    createProgram: vi.fn(() => ({})),
    createShader: vi.fn(() => ({})),
    createTexture: vi.fn(() => ({})),
    createVertexArray: vi.fn(() => ({})),
    getAttribLocation: vi.fn(() => 0),
    getExtension: vi.fn(() => null),
    getParameter: vi.fn(() => 4096),
    getProgramInfoLog: vi.fn(() => ''),
    getProgramParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ''),
    getShaderParameter: vi.fn(() => true),
    getUniformLocation: vi.fn(() => ({})),
  }, {
    /**
     * Возвращает значение состояния текущего класса.
     */
    get(target, property) {
      if (!(property in target)) {
        ;(target as Record<PropertyKey, unknown>)[property] = typeof property === 'string' && /^[A-Z0-9_]+$/.test(property)
          ? 0
          : vi.fn()
      }
      return (target as Record<PropertyKey, unknown>)[property]
    },
  }) as WebGL2RenderingContext
}

function installResizeObserverMock(): void {
  /**
   * Описывает ответственность ResizeObserverMock в архитектуре проекта.
   */
  class ResizeObserverMock implements ResizeObserver {
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
  }

  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
}
