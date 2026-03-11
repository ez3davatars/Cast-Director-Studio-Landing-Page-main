import React, { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';

const Navbar: React.FC = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { name: 'Workflow', href: '#workflow' },
    { name: 'Studio Access', href: '#pricing' },
  ];

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b ${isScrolled
          ? 'bg-nano-dark/90 backdrop-blur-md border-nano-border py-4'
          : 'bg-transparent border-transparent py-6'
        }`}
    >
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="relative w-12 h-12 flex items-center justify-center">
            <img src="/logo.png" alt="EZ3D Logo" className="w-full h-full object-contain drop-shadow-[0_0_8px_rgba(250,204,21,0.4)]" />
          </div>
          <div className="leading-tight">
            <h1 className="font-mono font-bold text-xl tracking-wider text-white uppercase">
              Cast Director Studio
            </h1>
            <p className="text-[10px] text-nano-text tracking-widest uppercase">
              Powered by Nanobanana 2
            </p>
          </div>
        </div>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <a
              key={link.name}
              href={link.href}
              className="text-sm font-medium text-nano-text hover:text-nano-yellow transition-colors tracking-wide uppercase"
            >
              {link.name}
            </a>
          ))}
          <button className="bg-nano-yellow hover:bg-nano-gold text-black font-bold py-2 px-6 rounded-sm text-sm tracking-wide transition-all transform hover:scale-105 shadow-[0_0_10px_rgba(250,204,21,0.2)]">
            LAUNCH STUDIO
          </button>
        </div>

        {/* Mobile Menu Toggle */}
        <button
          className="md:hidden text-white"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X size={28} /> : <Menu size={28} />}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden absolute top-full left-0 right-0 bg-nano-panel border-b border-nano-border p-6 flex flex-col gap-4 shadow-2xl">
          {navLinks.map((link) => (
            <a
              key={link.name}
              href={link.href}
              className="text-lg font-medium text-gray-200 hover:text-nano-yellow"
              onClick={() => setMobileMenuOpen(false)}
            >
              {link.name}
            </a>
          ))}
          <button className="w-full bg-nano-yellow text-black font-bold py-3 rounded-sm">
            LAUNCH STUDIO
          </button>
        </div>
      )}
    </nav>
  );
};

export default Navbar;