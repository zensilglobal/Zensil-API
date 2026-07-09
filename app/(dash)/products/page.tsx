import { getProducts } from "@/lib/queries";
import { Card } from "@/components/ui";
import DrilldownTable, { DrillCol } from "@/components/DrilldownTable";

export const dynamic = "force-dynamic";

const COLS: DrillCol[] = [
  { key: "name", label: "Product", strong: true },
  { key: "sku", label: "SKU" },
  { key: "amazonVel", label: "Amazon /d", kind: "float" },
  { key: "flipkartVel", label: "Flipkart /d", kind: "float" },
  { key: "shopifyVel", label: "Shopify /d", kind: "float" },
  { key: "marginPct", label: "Margin", kind: "pct" },
  { key: "totalStock", label: "Total Stock", kind: "int", total: true },
  { key: "bestChannel", label: "Best Channel", kind: "channel", filter: true },
];

export default async function ProductsPage() {
  const products = await getProducts();
  return (
    <>
      <div className="section-head">
        <div>
          <h2>Cross-Channel SKU Master</h2>
          <p>
            Amazon vs Flipkart vs Shopify velocity, contribution margin &amp; stock — click any product for its full
            detail page
          </p>
        </div>
      </div>
      <Card>
        <DrilldownTable
          rows={products as unknown as Record<string, string | number>[]}
          cols={COLS}
          filename="zensil-products"
          initialSort={{ key: "totalStock", dir: "desc" }}
          linkTo={{ base: "/products", key: "sku" }}
        />
      </Card>
    </>
  );
}
