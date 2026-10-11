import { Link } from 'react-router-dom'
import type { Item } from '../../shared/types'
import { CategoryBadge, CoverImage, StatusBadge } from './ui'

/** 片单网格卡片：封面 + 状态/类别角标 + 简要信息 */
export function ItemCard({ item, index = 0 }: { item: Item; index?: number }) {
  return (
    <Link
      to={`/items/${item.id}`}
      className="card anim group overflow-hidden transition duration-200 hover:-translate-y-0.5 hover:border-brand/50 hover:shadow-lg"
      style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
    >
      <div className="relative aspect-2/3 overflow-hidden bg-muted">
        <CoverImage
          title={item.title}
          coverUrl={item.cover_url}
          className="h-full w-full transition duration-300 group-hover:scale-[1.04]"
        />
        <div className="absolute top-1.5 left-1.5">
          <CategoryBadge category={item.category} />
        </div>
        <div className="absolute bottom-1.5 left-1.5">
          <StatusBadge status={item.status} />
        </div>
        {item.rating ? (
          <span className="absolute right-1.5 bottom-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[11px] font-medium text-white">
            ★ {item.rating}
          </span>
        ) : null}
      </div>
      <div className="p-2.5">
        <p className="serif truncate text-sm font-medium text-ink" title={item.title}>
          {item.title}
        </p>
        <p className="mt-0.5 truncate text-xs text-faint">
          {[item.year, item.season ? `第${item.season}季` : '', item.regions[0]].filter(Boolean).join(' · ')}
        </p>
        {item.tags.length > 0 && (
          <p className="mt-1 truncate text-[11px] text-faint">{item.tags.slice(0, 3).join(' / ')}</p>
        )}
      </div>
    </Link>
  )
}
