import React from 'react';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import Workflow from './components/Workflow';
import TechSpecs from './components/TechSpecs';
import Pricing from './components/Pricing';
import Footer from './components/Footer';

function App() {
  return (
    <main className="min-h-screen bg-nano-dark text-white selection:bg-nano-yellow selection:text-black font-sans">
      <Navbar />
      <Hero />
      <Workflow />
      <TechSpecs />
      <Pricing />
      <Footer />
    </main>
  );
}

export default App;