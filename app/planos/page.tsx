import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { PublicPricing } from '@/components/PublicPricing';
import { getPublicPlans } from '@/lib/publicPlans';
export const metadata = { title: 'Planos | CRM PLUS Store' };
export default async function Planos({ searchParams }: { searchParams: Promise<{ app?: string }> }) {
  const [plans, params] = await Promise.all([getPublicPlans(), searchParams]);
  return <><Header/><main><PublicPricing plans={plans} initialApp={params.app}/></main><Footer/></>;
}
