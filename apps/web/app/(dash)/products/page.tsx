import { getProducts } from "@/lib/queries";
import { num } from "@/lib/format";
import { Card, ChannelChip } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const products = await getProducts();
  return (
    <>
      <div className="section-head">
        <div>
          <h2>Cross-Channel SKU Master</h2>
          <p>Amazon vs Flipkart vs Shopify velocity, contribution margin &amp; stock — one row per product</p>
        </div>
      </div>
      <Card>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th className="right">Amazon</th>
                <th className="right">Flipkart</th>
                <th className="right">Shopify</th>
                <th className="right">Margin</th>
                <th className="right">Total Stock</th>
                <th className="right">Best Channel</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.sku}>
                  <td className="strong">{p.name}</td>
                  <td className="num tiny muted">{p.sku}</td>
                  <td className="right num" style={{ color: "var(--color-amazon)" }}>
                    {p.amazonVel.toFixed(1)}/d
                  </td>
                  <td className="right num" style={{ color: "var(--color-flipkart)" }}>
                    {p.flipkartVel.toFixed(1)}/d
                  </td>
                  <td className="right num" style={{ color: "var(--color-shopify)" }}>
                    {p.shopifyVel.toFixed(1)}/d
                  </td>
                  <td className="right num">{p.marginPct.toFixed(0)}%</td>
                  <td className="right num">{num(p.totalStock)}</td>
                  <td className="right">
                    <ChannelChip channel={p.bestChannel} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
