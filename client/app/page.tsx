import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import DashboardVisual from "@/components/DashboardVisual";
import FeaturesGrid from "@/components/FeaturesGrid";
import Testimonials from "@/components/Testimonials";
import FinalCTA from "@/components/FinalCTA";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-black font-sans ">
      <main className="flex-1">
        <Hero />
        <DashboardVisual />
        <FeaturesGrid />
        <Testimonials />
        <FinalCTA />
      </main>

      <Footer />
    </div>
  );
}
