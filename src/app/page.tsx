import Header from "@/components/Header";
import Hero from "@/components/Hero";
import Faq from "@/components/Faq";
import Footer from "@/components/Footer";
import StickyCta from "@/components/StickyCta";
import {
  TrustBar,
  WhyClassroom,
  Programs,
  Curriculum,
  Placements,
  Testimonials,
  BatchUrgency,
} from "@/components/Sections";

export default function Page() {
  return (
    <>
      <Header />
      <main className="pb-24">
        <Hero />
        <TrustBar />
        <WhyClassroom />
        <Programs />
        <Curriculum />
        <Placements />
        <Testimonials />
        <BatchUrgency />
        <Faq />
      </main>
      <Footer />
      <StickyCta />
    </>
  );
}
