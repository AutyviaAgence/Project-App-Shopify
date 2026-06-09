/**
 * Page de destination après installation Shopify (placeholder S1).
 * Sera remplacée par l'UI embedded Polaris (S3).
 */
export default async function ShopifyConnectedPage({
  searchParams,
}: {
  searchParams: Promise<{ shop?: string }>
}) {
  const { shop } = await searchParams
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-3">
        <h1 className="text-xl font-semibold">Boutique connectée ✅</h1>
        <p className="text-sm text-muted-foreground">
          {shop ? `La boutique ${shop} est bien connectée à Xeyo.` : 'Boutique connectée à Xeyo.'}
        </p>
        <p className="text-xs text-muted-foreground">
          L&apos;interface complète arrivera prochainement.
        </p>
      </div>
    </div>
  )
}
