import type {
  NovaApp,
  NovaAppCreateOptions,
  NovaCompiledNodeConstructor,
  NovaMountHandle,
  NovaSchemaPlugin,
  NovaScope,
  NovaSyncScope,
  NovaSurface,
} from '@endge/nova'

export interface NovaTemplateBinding {
  component: NovaCompiledNodeConstructor
  props: Record<string, unknown>
  listeners: Record<string, (...args: Array<any>) => void>
  refs: NovaScope['refs']
  source?: string
  debugId?: string
}

export interface NovaCanvasReadyPayload {
  app: NovaApp
  surface: NovaSurface<Record<string, any>>
  canvas: HTMLCanvasElement
  stage: HTMLElement
  node: NovaMountHandle['node'] | null
  scope: NovaScope
}

export interface NovaCanvasRootProps {
  padding?: unknown
  background?: string
  border?: unknown
  clip?: boolean
  rootId?: string
  rootClassName?: string
  styleSheet?: unknown
}

export type NovaCanvasDevtoolsOption = boolean | {
  id?: string
  label?: string
}

export interface NovaCanvasProps extends NovaCanvasRootProps {
  canvasLabel?: string
  width?: number | string
  height?: number | string
  maxDpr?: number
  surfaceName?: string
  plugins?: Array<NovaSchemaPlugin>
  appOptions?: Partial<Omit<NovaAppCreateOptions, 'target' | 'size'>>
  mount?: string
  props?: Record<string, unknown>
  devtools?: NovaCanvasDevtoolsOption
  syncScope?: NovaSyncScope
}
