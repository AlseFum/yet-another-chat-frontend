import { computed, defineComponent, h, inject } from 'vue'
import { ThemeKey } from '../theme/contract.js'

export default defineComponent({
  name: 'AppIcon',
  props: {
    name: { type: String, required: true },
    size: { type: [Number, String], default: 16 },
  },
  setup(props) {
    const theme = inject(ThemeKey)
    const shapes = computed(() => theme.activeTheme.value.icons[props.name] || theme.activeTheme.value.icons.info)
    return () => h('svg', {
      class: 'app-icon',
      width: props.size,
      height: props.size,
      viewBox: '0 0 24 24',
      'aria-hidden': 'true',
    }, shapes.value.map((shape, index) => h(shape.tag, { ...shape.attrs, key: index })))
  },
})
