import { defineComponent, inject, nextTick, onBeforeUnmount, provide, watch, type PropType } from 'vue'
import {
  NovaSyncScope,
  type NovaSyncLink as NovaSyncRuntimeLink,
  type NovaSyncSchedule,
} from '@endge/nova'

const NovaSyncVueScopeKey = Symbol('NovaSync.Scope')

export const NovaSyncScopeProvider = defineComponent({
  name: 'NovaSync.Scope',
  props: {
    scope: {
      type: Object as PropType<NovaSyncScope>,
      required: false,
      default: undefined,
    },
  },
  /**
   * Обновляет значение состояния текущего класса.
   */
  setup(props, { slots }) {
    const scope = props.scope ?? new NovaSyncScope()
    provide(NovaSyncVueScopeKey, scope)
    return () => slots.default?.()
  },
})

export const NovaSyncLink = defineComponent({
  name: 'NovaSync.Link',
  props: {
    scope: {
      type: Object as PropType<NovaSyncScope>,
      required: false,
      default: undefined,
    },
    id: {
      type: String,
      required: false,
      default: undefined,
    },
    from: {
      type: String,
      required: true,
    },
    to: {
      type: String,
      required: true,
    },
    schedule: {
      type: String as PropType<NovaSyncSchedule>,
      required: false,
      default: undefined,
    },
    bidirectional: {
      type: Boolean,
      required: false,
      default: false,
    },
    transform: {
      type: Function as PropType<(value: unknown) => unknown>,
      required: false,
      default: undefined,
    },
    filter: {
      type: Function as PropType<(value: unknown) => boolean>,
      required: false,
      default: undefined,
    },
    equals: {
      type: Function as PropType<(left: unknown, right: unknown) => boolean>,
      required: false,
      default: undefined,
    },
  },
  /**
   * Обновляет значение состояния текущего класса.
   */
  setup(props) {
    const injectedScope = inject<NovaSyncScope | undefined>(NovaSyncVueScopeKey, undefined)
    let link: NovaSyncRuntimeLink | null = null

    const resolveScope = () => {
      const scope = props.scope ?? injectedScope
      if (!scope) {
        throw new Error('[NovaSync.Link] scope prop or parent NovaSync.Scope is required')
      }
      return scope
    }

    const rebuild = async () => {
      await nextTick()
      link?.dispose()
      link = resolveScope().link({
        id: props.id,
        from: props.from,
        to: props.to,
        schedule: props.schedule,
        bidirectional: props.bidirectional,
        transform: props.transform,
        filter: props.filter,
        equals: props.equals,
      })
    }

    watch(
      () => [
        props.scope,
        props.id,
        props.from,
        props.to,
        props.schedule,
        props.bidirectional,
        props.transform,
        props.filter,
        props.equals,
      ] as const,
      rebuild,
      { immediate: true },
    )

    onBeforeUnmount(() => {
      link?.dispose()
      link = null
    })

    return () => null
  },
})

export const NovaSync = {
  Scope: NovaSyncScopeProvider,
  Link: NovaSyncLink,
} as const
