/** ECharts 按需注册：只打包大屏用到的图表与组件（柱图、昨日参考折线、散点、涟漪散点、飞线、省际 OD 桑基图、轨迹速度曲线的停留色带），显著缩小首屏 JS 体积（老旧播控设备解析更快） */
import * as echarts from 'echarts/core'
import { BarChart, EffectScatterChart, LineChart, LinesChart, SankeyChart, ScatterChart } from 'echarts/charts'
import { GeoComponent, GridComponent, MarkAreaComponent, TooltipComponent } from 'echarts/components'
import { LabelLayout } from 'echarts/features'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([BarChart, LineChart, ScatterChart, EffectScatterChart, LinesChart, SankeyChart, GeoComponent, GridComponent, MarkAreaComponent, TooltipComponent, LabelLayout, CanvasRenderer])

export default echarts
export type EChartsType = echarts.EChartsType
