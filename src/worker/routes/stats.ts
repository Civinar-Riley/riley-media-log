import { Hono } from 'hono'
import { todayLocal } from '../db'

export const statsRoutes = new Hono<{ Bindings: Env }>()

statsRoutes.get('/stats', async (c) => {
  const year = todayLocal().slice(0, 4)
  const [kpi, thisYear, byYear, byCategory, byRegion, byTag, byCreator, byRating, wantByMonth] =
    await Promise.all([
      c.env.DB.prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done,
                SUM(CASE WHEN status = 'want' THEN 1 ELSE 0 END) AS want,
                SUM(CASE WHEN status = 'watching' THEN 1 ELSE 0 END) AS watching,
                SUM(CASE WHEN status = 'dropped' THEN 1 ELSE 0 END) AS dropped
         FROM items`
      ).first<{ total: number; done: number; want: number; watching: number; dropped: number }>(),
      c.env.DB.prepare(`SELECT COUNT(DISTINCT item_id) AS n FROM viewings WHERE watched_on LIKE ? || '-%'`)
        .bind(year)
        .first<{ n: number }>(),
      c.env.DB.prepare(
        `SELECT strftime('%Y', watched_on) AS y, COUNT(*) AS viewings, COUNT(DISTINCT item_id) AS items
         FROM viewings GROUP BY y ORDER BY y DESC LIMIT 15`
      ).all(),
      c.env.DB.prepare(`SELECT category AS key, COUNT(*) AS count FROM items GROUP BY category`).all(),
      c.env.DB.prepare(
        `SELECT je.value AS v, COUNT(*) AS n FROM items i, json_each(i.regions) je
         GROUP BY je.value ORDER BY n DESC LIMIT 10`
      ).all(),
      c.env.DB.prepare(
        `SELECT je.value AS v, COUNT(*) AS n FROM items i, json_each(i.tags) je
         GROUP BY je.value ORDER BY n DESC LIMIT 10`
      ).all(),
      c.env.DB.prepare(
        `SELECT je.value AS v, COUNT(*) AS n FROM items i, json_each(i.creators) je
         GROUP BY je.value ORDER BY n DESC LIMIT 10`
      ).all(),
      c.env.DB.prepare(
        `SELECT COALESCE(rating, 0) AS rating, COUNT(*) AS n FROM items
         WHERE rating IS NOT NULL GROUP BY rating`
      ).all(),
      c.env.DB.prepare(
        `SELECT strftime('%Y-%m', created_at) AS m, COUNT(*) AS n FROM items
         WHERE status = 'want' GROUP BY m ORDER BY m`
      ).all(),
    ])

  const ratingRows = (byRating.results as { rating: number; n: number }[]).filter((r) => r.rating > 0)
  const unrated = (byRating.results as { rating: number; n: number }[]).find((r) => r.rating === 0)?.n ?? 0

  let cum = 0
  const wantRows = (wantByMonth.results as { m: string; n: number }[]).map((r) => {
    cum += r.n
    return { month: r.m, count: r.n, cumulative: cum }
  })

  return c.json({
    kpi: {
      total: kpi?.total ?? 0,
      done: kpi?.done ?? 0,
      want: kpi?.want ?? 0,
      watching: kpi?.watching ?? 0,
      dropped: kpi?.dropped ?? 0,
      done_this_year: thisYear?.n ?? 0,
    },
    by_year: (byYear.results as { y: string; viewings: number; items: number }[])
      .reverse()
      .map((r) => ({
        year: r.y,
        viewings: r.viewings,
        items: r.items,
      })),
    by_category: byCategory.results,
    by_region: byRegion.results.map((r) => [r.v, r.n] as [string, number]),
    by_tag: byTag.results.map((r) => [r.v, r.n] as [string, number]),
    by_creator: byCreator.results.map((r) => [r.v, r.n] as [string, number]),
    by_rating: ratingRows.map((r) => ({ rating: r.rating, count: r.n })),
    unrated,
    want_by_month: wantRows,
  })
})
