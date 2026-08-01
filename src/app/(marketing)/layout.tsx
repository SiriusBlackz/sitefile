import { MarketingNav, MarketingFooter } from "./marketing-ui";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingNav />
      {children}
      <MarketingFooter />
    </div>
  );
}
