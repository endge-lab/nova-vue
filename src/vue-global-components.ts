import type {} from 'vue'
import type NovaCanvas from '@/components/NovaCanvas.vue'
import type { NovaSyncLink, NovaSyncScopeProvider } from '@/components/NovaSync'

type NovaTemplateMarkerComponent = {
  new (): {
    $props: {
      component?: unknown
      src?: string
      source?: string
      debugId?: string
      'debug-id'?: string
      options?: unknown
      data?: unknown
      novaRefs?: Record<string, unknown>
      'nova-refs'?: Record<string, unknown>
    }
    $slots: {
      default?: () => unknown
    }
  }
}

declare module 'vue' {
  export interface GlobalComponents {
    NovaCanvas: typeof NovaCanvas
    'NovaSync.Scope': typeof NovaSyncScopeProvider
    'NovaSync.Link': typeof NovaSyncLink
    'nova-template': NovaTemplateMarkerComponent
  }
}

export {}
