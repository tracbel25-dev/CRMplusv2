import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { HomeExperience } from '@/components/HomeExperience';
import './cover.css';
import { PublicPricing } from '@/components/PublicPricing';
import { getPublicPlans } from '@/lib/publicPlans';
export const revalidate = 60;

export default async function Inicio(){const plans=await getPublicPlans();return <><Header/><main><HomeExperience pricing={<PublicPricing plans={plans}/>}/></main><Footer/></>}
