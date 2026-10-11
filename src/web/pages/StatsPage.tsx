import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { api } from '../api'
import { useCategories } from '../cat'
import { EmptyState, Loading, PageHeader } from '../components/ui'

/* 图表配色：全部引用主题变量，随主题联动 */
const PIE_COLORS = [
  'var(--brand)',
  'var(--seal)',
  'color-mix(in srgb, var(--brand) 55%, var(--bg))',
  'color-mix(in srgb, var(--seal) 55%, var(--bg))',
  'var(--ink-soft)',
  'color-mix(in srgb, var(--brand) 30%, var(--bg))',
]

const AXIS = { stroke: 'var(--line)', tick: { fill: 'var(--ink-faint)', fontSize: 11 } }
const TOOLTIP_STYLE = {
  backgroundColor: 'var(--card)',
  border: '1px solid var(--line)',
  borderRadius: 8,
  color: 'var(--ink)',
  fontSize: 12,
}

function Kpi({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="card anim p-4 text-center">
      <p className="serif text-3xl font-semibold text-brand md:text-4xl">{value}</p>
      <p className="mt-1 text-sm text-soft">{label}</p>
      {hint && <p className="text-xs text-faint">{hint}</p>}
    </div>
  )
}

function ChartCard({
  title,
  hint,
  children,
  delay = 0,
}: {
  title: string
  hint?: string
  children: React.ReactNode
  delay?: number
}) {
  return (
    <div className="card anim p-4" style={{ animationDelay: `${delay}ms` }}>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="serif font-medium text-ink">{title}</h3>
        {hint && <span className="text-xs text-faint">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

/** 横向条形图 TOP 榜 */
function TopBar({
  data,
  onPick,
  color = 'var(--brand)',
}: {
  data: [string, number][]
  onPick: (v: string) => void
  color?: string
}) {
  const rows = [...data].reverse()
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, rows.length * 30 + 20)}>
      <BarChart data={rows.map(([name, count]) => ({ name, count }))} layout="vertical" margin={{ left: 8, right: 24 }}>
        <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" allowDecimals={false} {...AXIS} />
        <YAxis type="category" dataKey="name" width={90} {...AXIS} />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--muted)' }} />
        <Bar
          dataKey="count"
          fill={color}
          radius={[0, 4, 4, 0]}
          barSize={14}
          onClick={(_: unknown, index: number) => rows[index] && onPick(rows[index][0])}
          className="cursor-pointer"
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

export default function StatsPage() {
  const navigate = useNavigate()
  const statsQ = useQuery({ queryKey: ['stats'], queryFn: api.stats })
  const { labelOf } = useCategories()

  if (statsQ.isLoading) return <Loading />
  const stats = statsQ.data
  if (!stats) return <EmptyState title="统计加载失败" hint={statsQ.error instanceof Error ? statsQ.error.message : ''} />

  const hasData = stats.kpi.total > 0
  if (!hasData) {
    return <EmptyState title="还没有数据" hint="记下第一部作品，这里的图表就会活起来。" />
  }

  const go = (query: string) => navigate(`/?${query}`)

  return (
    <div>
      <PageHeader title="统计" sub="点图表能跳到对应的筛选结果" />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="记录总数" value={stats.kpi.total} />
        <Kpi label="看过" value={stats.kpi.done} hint={`在看 ${stats.kpi.watching} · 弃 ${stats.kpi.dropped}`} />
        <Kpi label="想看" value={stats.kpi.want} hint="待 Enjoy 清单" />
        <Kpi label={`今年看完`} value={stats.kpi.done_this_year} hint="按观看日期统计" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ChartCard title="年度观看量" hint="按观看日期 · 点击下钻" delay={40}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={stats.by_year.map((r) => ({ name: r.year, 观看次数: r.viewings, 部数: r.items }))} margin={{ top: 8 }}>
              <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" {...AXIS} />
              <YAxis allowDecimals={false} {...AXIS} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--muted)' }} />
              <Bar
                dataKey="观看次数"
                fill="var(--brand)"
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
                className="cursor-pointer"
                onClick={(_: unknown, index: number) => {
                  const y = stats.by_year[index]?.year
                  if (y) go(`watched_from=${y}-01-01&watched_to=${y}-12-31`)
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="想看积压走势" hint="每月新增想看（累计）" delay={80}>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={stats.want_by_month.map((r) => ({ name: r.month, 累计想看: r.cumulative, 当月新增: r.count }))} margin={{ top: 8 }}>
              <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" {...AXIS} />
              <YAxis allowDecimals={false} {...AXIS} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Area type="monotone" dataKey="累计想看" stroke="var(--seal)" fill="color-mix(in srgb, var(--seal) 18%, transparent)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="类别分布" hint="点击下钻" delay={120}>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={stats.by_category.map((r) => ({ name: labelOf(r.key), value: r.count, key: r.key }))}
                dataKey="value"
                nameKey="name"
                innerRadius={55}
                outerRadius={90}
                paddingAngle={2}
                className="cursor-pointer"
                onClick={(data: unknown) => {
                  const d = data as { payload?: { key?: string } }
                  const key = d?.payload?.key
                  if (key) go(`category=${key}`)
                }}
              >
                {stats.by_category.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="var(--card)" />
                ))}
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="评分分布" hint={`未评分 ${stats.unrated} 条`} delay={160}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={stats.by_rating.map((r) => ({ name: '★'.repeat(r.rating), 条数: r.count }))} margin={{ top: 8 }}>
              <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" {...AXIS} />
              <YAxis allowDecimals={false} {...AXIS} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--muted)' }} />
              <Bar
                dataKey="条数"
                fill="var(--seal)"
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
                className="cursor-pointer"
                onClick={(_: unknown, index: number) => {
                  const r = stats.by_rating[index]?.rating
                  if (r) go(`rating_min=${r}`)
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="地区 TOP 10" hint="点击下钻" delay={200}>
          <TopBar data={stats.by_region} onPick={(v) => go(`regions=${encodeURIComponent(v)}&region_mode=any`)} />
        </ChartCard>
        <ChartCard title="类型标签 TOP 10" hint="点击下钻" delay={240}>
          <TopBar data={stats.by_tag} onPick={(v) => go(`tags=${encodeURIComponent(v)}&tag_mode=any`)} color="var(--seal)" />
        </ChartCard>
        <ChartCard title="主创排行 TOP 10" hint="出现最多的作者 / 导演 / 演员" delay={280}>
          <TopBar data={stats.by_creator} onPick={(v) => go(`creators=${encodeURIComponent(v)}&creator_mode=any`)} />
        </ChartCard>
      </div>
    </div>
  )
}
