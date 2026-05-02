import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import DashboardVisual from "@/components/DashboardVisual";
import PipelineFlow from "@/components/PipelineFlow";
import FeaturesGrid from "@/components/FeaturesGrid";
import CodeDiffVisual from "@/components/CodeDiffVisual";
import Testimonials from "@/components/Testimonials";
import FinalCTA from "@/components/FinalCTA";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-black font-sans ">
      <main className="flex-1">
        <Hero />
        <DashboardVisual />
        <PipelineFlow />
        <CodeDiffVisual />
        <FeaturesGrid />
        <Testimonials />
        <FinalCTA />
      </main>

      <Footer />
    </div>
  );
}
