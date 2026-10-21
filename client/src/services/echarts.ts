/** ECharts 按需注册：只打包大屏用到的图表与组件，显著缩小首屏 JS 体积（老旧播控设备解析更快） */
import * as echarts from 'echarts/core'
import { BarChart, EffectScatterChart, LinesChart, ScatterChart } from 'echarts/charts'
import { GeoComponent, GridComponent, TooltipComponent } from 'echarts/components'
import { LabelLayout } from 'echarts/features'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([BarChart, ScatterChart, EffectScatterChart, LinesChart, GeoComponent, GridComponent, TooltipComponent, LabelLayout, CanvasRenderer])

export default echarts
export type EChartsType = echarts.EChartsType
