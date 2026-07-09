import { parseFilter, windowLabel } from "@/lib/filter";
import { getReviewKpis, getReviews, getRatingDistribution, getSkuReviewAggs } from "@/lib/queries";
import { num, pct } from "@/lib/format";
import { KpiGrid, Card } from "@/components/ui";
import DrilldownTable, { DrillCol } from "@/components/DrilldownTable";
import ImportReviews from "@/components/ImportReviews";

/*
  Reviews — customer sentiment across channels. Live rows come from the
  warehouse `reviews` table (fed by the CSV import — no marketplace
  exposes a seller reviews API); sample mode generates a realistic set.
  Global channel + date filters apply, like every other section.
*/

const SKU_COLS: DrillCol[] = [
  { key: "name", label: "Product", strong: true },
  { key: "sku", label: "SKU" },
  { key: "reviews", label: "Reviews", kind: "int", total: true },
  { key: "avg", label: "Avg Rating", kind: "rating" },
  { key: "five", label: "5★", kind: "int", total: true },
  { key: "low", label: "1–2★", kind: "int", total: true },
];

const REVIEW_COLS: DrillCol[] = [
  { key: "date", label: "Date", kind: "date" },
  { key: "channel", label: "Channel", kind: "channel", filter: true },
  { key: "name", label: "Product", strong: true },
  { key: "rating", label: "Rating", kind: "rating", filter: true },
  { key: "title", label: "Title", strong: true },
  { key: "body", label: "Review" },
  { key: "author", label: "By" },
  { key: "verifiedLabel", label: "Verified", filter: true },
];

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const f = parseFilter(await searchParams);
  const [kpis, reviews, dist, aggs] = await Promise.all([
    getReviewKpis(f),
    getReviews(f),
    getRatingDistribution(f),
    getSkuReviewAggs(f),
  ]);
  const total = dist.reduce((a, d) => a + d.count, 0);
  const rows = reviews.map((r) => ({ ...r, verified: String(r.verified), verifiedLabel: r.verified ? "Verified" : "—" }));

  return (
    <>
      <KpiGrid kpis={kpis} />

      <div className="grid g-3 mt">
        <Card title="Rating Distribution" sub={`Share of reviews per star · ${windowLabel(f)}`}>
          {total ? (
            <div style={{ paddingTop: 6 }}>
              {dist.map((d) => (
                <div key={d.rating} className="dist-row">
                  <span className="stars">
                    {d.rating}<span style={{ letterSpacing: 0 }}>★</span>
                  </span>
                  <div className="bar">
                    <i
                      style={{
                        width: `${(d.count / total) * 100}%`,
                        background:
                          d.rating >= 4
                            ? "var(--color-green)"
                            : d.rating === 3
                              ? "var(--color-gold)"
                              : "var(--color-crimson)",
                      }}
                    />
                  </div>
                  <span className="n">
                    {num(d.count)} · {total ? pct((d.count / total) * 100) : "0%"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">No reviews in this window — import a CSV to get started</div>
          )}
        </Card>

        <Card
          title="Ratings by Product"
          sub="Window average per SKU · click a row for the product detail"
          className="span-2"
        >
          <DrilldownTable
            rows={aggs as unknown as Record<string, string | number>[]}
            cols={SKU_COLS}
            filename={`zensil-review-skus-${f.channel}`}
            initialSort={{ key: "reviews", dir: "desc" }}
            linkTo={{ base: "/products", key: "sku" }}
          />
        </Card>
      </div>

      <div className="mt">
        <Card
          title="All Reviews"
          sub="Every review in the window — search, filter by star or channel, export"
          action={<ImportReviews />}
        >
          <DrilldownTable
            rows={rows as unknown as Record<string, string | number>[]}
            cols={REVIEW_COLS}
            filename={`zensil-reviews-${f.channel}-${f.days}d`}
            initialSort={{ key: "date", dir: "desc" }}
            linkTo={{ base: "/products", key: "sku" }}
          />
          <p className="tiny muted" style={{ marginTop: 12 }}>
            Import format: CSV with header <code style={{ fontFamily: "var(--font-mono)" }}>channel, sku, rating, date</code>{" "}
            (optional: title, body, author, verified, review_id). Re-importing the same file is safe — duplicates are
            skipped.
          </p>
          <p className="tiny muted" style={{ marginTop: 6 }}>
            Why CSV? Amazon exposes no seller API for review text, and its Customer Feedback API (aggregated
            insights only) does not cover the India marketplace — verified against SP-API. Export reviews from
            Seller Central (Brand Registry → Manage Your Customer Reviews) or your Shopify review app and import
            them here; scraping review pages violates marketplace terms and risks the seller account.
          </p>
        </Card>
      </div>
    </>
  );
}
