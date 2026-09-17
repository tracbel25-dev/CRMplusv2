import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { HomeExperience } from '@/components/HomeExperience';
import { PublicPricing } from '@/components/PublicPricing';
import { getPublicPlans } from '@/lib/publicPlans';
import './cover.css';

export default async function Inicio(){
  const plans = await getPublicPlans();
  return <><Header/><main><HomeExperience pricing={<PublicPricing plans={plans}/>}/></main><Footer/></>;
}
