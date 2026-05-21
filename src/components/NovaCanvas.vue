<script lang="ts">
import type { installNovaDevtools } from '@endge/nova-devtools/runtime'

type NovaDevtoolsRuntimeModule = {
  installNovaDevtools: typeof installNovaDevtools
}
type NovaDevtoolsRegistrationOptions = Parameters<typeof installNovaDevtools>[1]

let novaCanvasDevtoolsRuntimeModulePromise: Promise<NovaDevtoolsRuntimeModule> | null = null

function loadNovaCanvasDevtoolsRuntime(): Promise<NovaDevtoolsRuntimeModule> {
  novaCanvasDevtoolsRuntimeModulePromise ??= import('@endge/nova-devtools/runtime')
  return novaCanvasDevtoolsRuntimeModulePromise
}
</script>

<script setup lang="ts">
import {
  computed,
  defineComponent,
  nextTick,
  onBeforeUnmount,
  onMounted,
  onUpdated,
  ref,
  useSlots,
  watch,
  type CSSProperties,
  type PropType,
  type VNode,
} from 'vue'
import { Nova, type NovaApp, type NovaMountHandle, type NovaSchemaPlugin, type NovaScope, type NovaSurface, type NovaSyncScope } from '@endge/nova'
import type { NovaCanvasDevtoolsOption, NovaCanvasReadyPayload, NovaTemplateBinding } from '@/types'

const props = withDefaults(
  defineProps<{
    canvasLabel?: string
    width?: number | string
    height?: number | string
    maxDpr?: number
    surfaceName?: string
    plugins?: Array<NovaSchemaPlugin>
    appOptions?: Record<string, any>
    padding?: unknown
    background?: string
    border?: unknown
    clip?: boolean
    rootId?: string
    rootClassName?: string
    styleSheet?: unknown
    devtools?: NovaCanvasDevtoolsOption
    syncScope?: NovaSyncScope
  }>(),
  {
    canvasLabel: 'Nova canvas',
    maxDpr: 2,
    surfaceName: 'nova-canvas',
    plugins: () => [],
    appOptions: () => ({}),
    devtools: undefined,
  },
)

const emit = defineEmits<{
  (event: 'ready', payload: NovaCanvasReadyPayload): void
  (event: 'destroy'): void
}>()

defineSlots<{
  nova?: () => unknown
  overlay?: () => unknown
}>()

const slots = useSlots()
const canvas = ref<HTMLCanvasElement | null>(null)
const stage = ref<HTMLElement | null>(null)

let app: NovaApp | null = null
let surface: NovaSurface<Record<string, any>> | null = null
let mountHandle: NovaMountHandle | null = null
let resizeObserver: ResizeObserver | null = null
let scope: NovaScope = Nova.createScope()
let templateBinding: NovaTemplateBinding | null = null
let devtoolsDispose: (() => void) | null = null
let devtoolsRegistrationToken = 0

const stageStyle = computed<CSSProperties>(() => ({
  position: 'relative',
  width: resolveCssSize(props.width),
  height: resolveCssSize(props.height),
  overflow: 'hidden',
}))

const NovaSlotReader = defineComponent({
  name: 'NovaSlotReader',
  props: {
    renderSlot: {
      type: Function as PropType<() => unknown>,
      required: false,
      default: undefined,
    },
  },
  emits: {
    change: (_nodes: Array<VNode>) => true,
  },
  /**
   * Обновляет значение состояния текущего класса.
   */
  setup(readerProps, { emit: readerEmit }) {
    let latestNodes: Array<VNode> = []
    const flush = () => readerEmit('change', latestNodes)

    onMounted(flush)
    onUpdated(flush)

    return () => {
      const rendered = readerProps.renderSlot?.() ?? []
      latestNodes = Array.isArray(rendered) ? rendered as Array<VNode> : [rendered as VNode]
      return null
    }
  },
})

function handleNovaSlotChange(nodes: Array<VNode>): void {
  const nextBinding = readNovaTemplateBinding(nodes)
  const shouldRemount = !isSameTemplateBinding(templateBinding, nextBinding)
  templateBinding = nextBinding

  if (!app || !surface || !stage.value) return
  if (shouldRemount) {
    if (templateBinding) {
      mountTemplate(readStageSize())
    } else {
      mountHandle?.destroy()
      mountHandle = null
      scope = Nova.createScope()
    }
    return
  }

  scope.refs = templateBinding?.refs ?? {}
  resizeRuntime()
}

watch(
  () => [
    props.padding,
    props.background,
    props.border,
    props.clip,
    props.rootId,
    props.rootClassName,
    props.styleSheet,
    props.width,
    props.height,
  ],
  () => {
    resizeRuntime()
  },
)

watch(
  () => [props.devtools, props.canvasLabel],
  () => registerDevtools(),
)

onMounted(async () => {
  await nextTick()
  mountRuntime()
})

onBeforeUnmount(() => {
  destroyRuntime()
})

function mountRuntime(): void {
  if (!canvas.value || !stage.value) return

  destroyRuntime(false)

  const size = readStageSize()
  app = Nova.createApp({
    ...props.appOptions,
    ...(props.syncScope ? { syncScope: props.syncScope } : {}),
    target: canvas.value,
    size: {
      ...(props.appOptions?.size ?? {}),
      ...size,
      maxDpr: props.maxDpr,
    },
  } as never)

  for (const plugin of props.plugins) {
    plugin(app.schema)
  }

  surface = app.createSurface(props.surfaceName)
  mountTemplate(size)

  resizeObserver = new ResizeObserver(() => resizeRuntime())
  resizeObserver.observe(stage.value)
  registerDevtools()

  emit('ready', {
    app,
    surface,
    canvas: canvas.value,
    stage: stage.value,
    node: mountHandle?.node ?? null,
    scope,
  })
}

function mountTemplate(size: { width: number; height: number }): void {
  if (!app || !surface || !templateBinding) return

  mountHandle?.destroy()
  scope = Nova.createScope({ refs: templateBinding.refs })
  mountHandle = Nova.mount(templateBinding.component, {
    app,
    surface,
    scope,
    props: resolveTemplateProps(size),
    listeners: templateBinding.listeners,
  })
}

function resizeRuntime(): void {
  if (!app || !stage.value) return

  const size = readStageSize()
  app.options(size)
  mountHandle?.updateProps(resolveTemplateProps(size))
  mountHandle?.updateListeners(templateBinding?.listeners ?? {})
}

function resolveTemplateProps(size: { width: number; height: number }): Record<string, unknown> {
  return {
    ...(templateBinding?.props ?? {}),
    width: size.width,
    height: size.height,
    padding: props.padding,
    background: props.background,
    border: props.border,
    clip: props.clip,
    rootId: props.rootId,
    rootClassName: props.rootClassName,
    styleSheet: props.styleSheet,
  }
}

function readStageSize(): { width: number; height: number } {
  return {
    width: Math.max(1, Math.floor(stage.value?.clientWidth || numericSize(props.width) || window.innerWidth)),
    height: Math.max(1, Math.floor(stage.value?.clientHeight || numericSize(props.height) || window.innerHeight)),
  }
}

function destroyRuntime(emitEvent = true): void {
  disposeDevtools()
  resizeObserver?.disconnect()
  resizeObserver = null

  try {
    mountHandle?.destroy()
    app?.destroy()
  } catch (error) {
    console.warn('[NovaCanvas] Runtime destroy failed', error)
  }

  mountHandle = null
  surface = null
  app = null
  scope = Nova.createScope()
  if (emitEvent) emit('destroy')
}

function registerDevtools(): void {
  disposeDevtools()
  if (!app || !isDevtoolsEnabled(props.devtools)) return

  const targetApp = app
  const options = resolveDevtoolsOptions(props.devtools)
  const token = ++devtoolsRegistrationToken
  void registerDevtoolsAsync(targetApp, options, token)
}

function disposeDevtools(): void {
  devtoolsRegistrationToken += 1
  devtoolsDispose?.()
  devtoolsDispose = null
}

async function registerDevtoolsAsync(
  targetApp: NovaApp,
  options: NovaDevtoolsRegistrationOptions,
  token: number,
): Promise<void> {
  try {
    const { installNovaDevtools } = await loadNovaCanvasDevtoolsRuntime()
    if (app !== targetApp || token !== devtoolsRegistrationToken) return
    devtoolsDispose = installNovaDevtools(targetApp, options)
  } catch (error) {
    console.warn('[NovaCanvas] Devtools registration failed', error)
  }
}

function isDevtoolsEnabled(option: NovaCanvasDevtoolsOption | undefined): boolean {
  if (option === false) return false
  if (option === true || typeof option === 'object') return true
  return (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV === true
}

function resolveDevtoolsOptions(option: NovaCanvasDevtoolsOption | undefined): { id?: string; label?: string } {
  const explicit = typeof option === 'object' ? option : {}
  return {
    id: explicit.id,
    label: explicit.label ?? props.canvasLabel,
  }
}

function isSameTemplateBinding(current: NovaTemplateBinding | null, next: NovaTemplateBinding | null): boolean {
  if (current === next) return true
  if (!current || !next) return false
  return current.component === next.component
    && current.source === next.source
    && current.debugId === next.debugId
}

function readNovaTemplateBinding(nodes: Array<VNode>): NovaTemplateBinding | null {
  const marker = findNovaTemplateNode(nodes)
  const markerProps = marker?.props as Record<string, unknown> | null | undefined
  if (!markerProps || typeof markerProps.component !== 'function') return null

  const templateProps: Record<string, unknown> = {}
  const listeners: Record<string, (...args: Array<any>) => void> = {}
  for (const [key, value] of Object.entries(markerProps)) {
    if (key === 'component' || key === 'source' || key === 'debug-id' || key === 'debugId') continue
    if (key === 'novaRefs' || key === 'nova-refs') continue
    if (key.startsWith('on') && key.length > 2 && typeof value === 'function') {
      const eventName = `${key.charAt(2).toLowerCase()}${key.slice(3)}`
      listeners[eventName] = value as (...args: Array<any>) => void
      continue
    }
    templateProps[normalizeTemplatePropKey(key)] = value
  }

  return {
    component: markerProps.component as NovaTemplateBinding['component'],
    props: templateProps,
    listeners,
    refs: resolveMarkerRefs(markerProps),
    source: typeof markerProps.source === 'string' ? markerProps.source : undefined,
    debugId: typeof markerProps['debug-id'] === 'string'
      ? markerProps['debug-id']
      : typeof markerProps.debugId === 'string'
        ? markerProps.debugId
        : undefined,
  }
}

function findNovaTemplateNode(nodes: Array<VNode>): VNode | null {
  for (const node of nodes) {
    if (node.type === 'nova-template') return node
    if (Array.isArray(node.children)) {
      const child = findNovaTemplateNode(node.children as Array<VNode>)
      if (child) return child
    }
  }
  return null
}

function resolveMarkerRefs(props: Record<string, unknown>): NovaScope['refs'] {
  const refs = props.novaRefs ?? props['nova-refs']
  return refs && typeof refs === 'object' ? refs as NovaScope['refs'] : {}
}

function normalizeTemplatePropKey(key: string): string {
  return key.replace(/-([a-z])/g, (_match, char: string) => char.toUpperCase())
}

function resolveCssSize(value: number | string | undefined): string {
  if (typeof value === 'number') return `${value}px`
  return value ?? '100%'
}

function numericSize(value: number | string | undefined): number | null {
  if (typeof value === 'number') return value
  if (typeof value !== 'string') return null
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}
</script>

<template>
  <section ref="stage" :style="stageStyle" :aria-label="canvasLabel">
    <NovaSlotReader :render-slot="slots.nova" @change="handleNovaSlotChange" />
    <canvas ref="canvas" style="display: block; width: 100%; height: 100%;" />
    <slot name="overlay" />
  </section>
</template>
