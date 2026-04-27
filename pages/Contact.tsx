import React, { useState } from 'react';
import { Headphones, ShoppingCart, Handshake, Send, CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import ContentPageLayout from '../components/ContentPageLayout';

const inquiryTypes = [
  'Product Support',
  'Sales / Licensing',
  'Hosted Credits or Billing',
  'BYOK License Questions',
  'Partnerships / Media',
  'General Question',
] as const;

const contactCards = [
  {
    icon: Headphones,
    title: 'Support',
    description:
      'For product help, account questions, generation issues, or workflow support.',
    email: 'support@castdirectorstudio.com',
  },
  {
    icon: ShoppingCart,
    title: 'Sales & Licensing',
    description:
      'For hosted plans, BYOK licenses, agency use, or commercial licensing questions.',
    email: 'sales@castdirectorstudio.com',
  },
  {
    icon: Handshake,
    title: 'Partnerships & Media',
    description:
      'For collaborations, interviews, creator partnerships, or press inquiries.',
    email: 'sales@castdirectorstudio.com',
  },
];

type FormState = 'idle' | 'sending' | 'success' | 'error';

export default function Contact() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [inquiryType, setInquiryType] = useState('');
  const [licenseType, setLicenseType] = useState('');
  const [orderEmail, setOrderEmail] = useState('');
  const [message, setMessage] = useState('');
  const [gotcha, setGotcha] = useState(''); // honeypot

  const [formState, setFormState] = useState<FormState>('idle');
  const [ticketId, setTicketId] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // ---------- Client-side validation ----------
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isValidEmail = emailRegex.test(email);
  const canSubmit =
    name.trim().length > 0 &&
    email.trim().length > 0 &&
    isValidEmail &&
    inquiryType.length > 0 &&
    message.trim().length > 0 &&
    message.length <= 5000;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || formState === 'sending') return;

    setFormState('sending');
    setErrorMsg('');

    try {
      const payload: Record<string, string> = {
        name: name.trim(),
        email: email.trim(),
        inquiryType,
        message: message.trim(),
        _gotcha: gotcha,
      };

      // Include optional fields only if provided
      if (company.trim()) payload.company = company.trim();
      if (licenseType.trim()) payload.licenseType = licenseType.trim();
      if (orderEmail.trim()) payload.orderEmail = orderEmail.trim();

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/contact-form-submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (data.ok && data.ticketId) {
        setTicketId(data.ticketId);
        setFormState('success');
      } else {
        setErrorMsg(data.error || 'Something went wrong. Please try again.');
        setFormState('error');
      }
    } catch {
      setErrorMsg('Could not reach the server. Please check your connection and try again.');
      setFormState('error');
    }
  };

  const resetForm = () => {
    setName('');
    setEmail('');
    setCompany('');
    setInquiryType('');
    setLicenseType('');
    setOrderEmail('');
    setMessage('');
    setGotcha('');
    setTicketId('');
    setErrorMsg('');
    setFormState('idle');
  };

  return (
    <ContentPageLayout title="Contact">
      <div className="mb-16">
        <div className="w-10 h-[3px] rounded-full bg-nano-yellow mb-4" />
        <h1 className="font-display text-4xl md:text-5xl font-bold text-white tracking-tight mb-6">
          Contact Cast Director Studio
        </h1>
        <p className="text-lg text-slate-300 leading-relaxed max-w-3xl">
          Have a question about the app, licensing, support, partnerships, or
          creator workflows? Send us a message and we'll direct it to the right
          place.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">
        {/* Contact Form — 3 columns */}
        <div className="lg:col-span-3">
          {formState === 'success' ? (
            <div className="p-10 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] text-center">
              <CheckCircle size={48} className="text-emerald-400 mx-auto mb-4" />
              <h2 className="font-display text-2xl font-bold text-white mb-3">
                Message Received
              </h2>
              <p className="text-slate-300 mb-2">
                Your ticket ID is:
              </p>
              <p className="text-nano-yellow font-mono text-lg font-bold mb-6">
                {ticketId}
              </p>
              <p className="text-slate-400 mb-6 max-w-md mx-auto text-sm">
                We typically respond within 1–2 business days. You should also
                receive a confirmation email with your inquiry summary.
              </p>
              <button
                onClick={resetForm}
                className="px-6 py-3 rounded-full bg-white/10 text-white text-sm font-bold uppercase tracking-wide hover:bg-[#d4a017] hover:text-black transition-all"
              >
                Send Another Message
              </button>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="p-8 rounded-2xl border border-white/[0.06] bg-white/[0.02] space-y-6"
            >
              {/* Honeypot — hidden from users */}
              <input
                type="text"
                name="_gotcha"
                value={gotcha}
                onChange={(e) => setGotcha(e.target.value)}
                style={{ display: 'none' }}
                tabIndex={-1}
                autoComplete="off"
              />

              {/* Name */}
              <div>
                <label
                  htmlFor="contact-name"
                  className="block text-sm font-semibold text-slate-300 mb-2"
                >
                  Name <span className="text-red-400">*</span>
                </label>
                <input
                  id="contact-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={120}
                  placeholder="Your name"
                  className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.06] text-white placeholder-slate-500 text-[15px] focus:outline-none focus:border-nano-yellow/40 focus:ring-1 focus:ring-nano-yellow/20 transition-colors"
                />
              </div>

              {/* Email */}
              <div>
                <label
                  htmlFor="contact-email"
                  className="block text-sm font-semibold text-slate-300 mb-2"
                >
                  Email <span className="text-red-400">*</span>
                </label>
                <input
                  id="contact-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  maxLength={190}
                  placeholder="your@email.com"
                  className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.06] text-white placeholder-slate-500 text-[15px] focus:outline-none focus:border-nano-yellow/40 focus:ring-1 focus:ring-nano-yellow/20 transition-colors"
                />
              </div>

              {/* Company (optional) */}
              <div>
                <label
                  htmlFor="contact-company"
                  className="block text-sm font-semibold text-slate-300 mb-2"
                >
                  Company <span className="text-slate-500 font-normal">(optional)</span>
                </label>
                <input
                  id="contact-company"
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  maxLength={160}
                  placeholder="Your company or studio"
                  className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.06] text-white placeholder-slate-500 text-[15px] focus:outline-none focus:border-nano-yellow/40 focus:ring-1 focus:ring-nano-yellow/20 transition-colors"
                />
              </div>

              {/* Inquiry Type */}
              <div>
                <label
                  htmlFor="contact-inquiry"
                  className="block text-sm font-semibold text-slate-300 mb-2"
                >
                  Inquiry Type <span className="text-red-400">*</span>
                </label>
                <select
                  id="contact-inquiry"
                  value={inquiryType}
                  onChange={(e) => setInquiryType(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.06] text-white text-[15px] focus:outline-none focus:border-nano-yellow/40 focus:ring-1 focus:ring-nano-yellow/20 transition-colors appearance-none cursor-pointer"
                >
                  <option value="" className="bg-[#0a1628] text-slate-400">
                    Select an inquiry type
                  </option>
                  {inquiryTypes.map((type) => (
                    <option
                      key={type}
                      value={type}
                      className="bg-[#0a1628] text-white"
                    >
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              {/* License Type (optional — shown for licensing inquiries) */}
              {(inquiryType === 'Sales / Licensing' || inquiryType === 'BYOK License Questions') && (
                <div>
                  <label
                    htmlFor="contact-license"
                    className="block text-sm font-semibold text-slate-300 mb-2"
                  >
                    License Type <span className="text-slate-500 font-normal">(optional)</span>
                  </label>
                  <input
                    id="contact-license"
                    type="text"
                    value={licenseType}
                    onChange={(e) => setLicenseType(e.target.value)}
                    maxLength={120}
                    placeholder="e.g. Starter, Pro, Studio, BYOK"
                    className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.06] text-white placeholder-slate-500 text-[15px] focus:outline-none focus:border-nano-yellow/40 focus:ring-1 focus:ring-nano-yellow/20 transition-colors"
                  />
                </div>
              )}

              {/* Order Email (optional — shown for billing inquiries) */}
              {(inquiryType === 'Hosted Credits or Billing' || inquiryType === 'Product Support') && (
                <div>
                  <label
                    htmlFor="contact-order-email"
                    className="block text-sm font-semibold text-slate-300 mb-2"
                  >
                    Order Email <span className="text-slate-500 font-normal">(optional — if different from above)</span>
                  </label>
                  <input
                    id="contact-order-email"
                    type="email"
                    value={orderEmail}
                    onChange={(e) => setOrderEmail(e.target.value)}
                    maxLength={190}
                    placeholder="email@used-for-purchase.com"
                    className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.06] text-white placeholder-slate-500 text-[15px] focus:outline-none focus:border-nano-yellow/40 focus:ring-1 focus:ring-nano-yellow/20 transition-colors"
                  />
                </div>
              )}

              {/* Message */}
              <div>
                <label
                  htmlFor="contact-message"
                  className="block text-sm font-semibold text-slate-300 mb-2"
                >
                  Message <span className="text-red-400">*</span>
                </label>
                <textarea
                  id="contact-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                  maxLength={5000}
                  rows={6}
                  placeholder="Tell us how we can help..."
                  className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.06] text-white placeholder-slate-500 text-[15px] focus:outline-none focus:border-nano-yellow/40 focus:ring-1 focus:ring-nano-yellow/20 transition-colors resize-none"
                />
                <p className="text-xs text-slate-500 mt-1 text-right">
                  {message.length}/5000
                </p>
              </div>

              {/* Error message */}
              {formState === 'error' && (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/[0.08] border border-red-500/20">
                  <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-300">{errorMsg}</p>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={!canSubmit || formState === 'sending'}
                className="w-full py-4 px-6 rounded-full text-sm font-bold tracking-wide uppercase transition-all flex items-center justify-center gap-2 bg-white/10 text-white hover:bg-[#d4a017] hover:text-black hover:shadow-[0_0_20px_rgba(212,160,23,0.35)] hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:bg-white/10 disabled:hover:text-white disabled:hover:shadow-none"
              >
                {formState === 'sending' ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    Send Message
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        {/* Contact Cards — 2 columns */}
        <div className="lg:col-span-2 space-y-4">
          {contactCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.title}
                className="p-6 rounded-2xl border border-white/[0.04] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.08] transition-all duration-300"
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-white/[0.04] flex items-center justify-center shrink-0 mt-0.5">
                    <Icon size={20} className="text-nano-yellow" />
                  </div>
                  <div>
                    <h3 className="font-display text-base font-bold text-white mb-2">
                      {card.title}
                    </h3>
                    <p className="text-sm text-slate-400 leading-relaxed mb-3">
                      {card.description}
                    </p>
                    <a
                      href={`mailto:${card.email}`}
                      className="text-sm text-nano-yellow hover:text-white transition-colors font-medium"
                    >
                      {card.email}
                    </a>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Response time note */}
          <div className="p-5 rounded-2xl border border-white/[0.03] bg-white/[0.01]">
            <p className="text-xs text-slate-500 leading-relaxed">
              We typically respond within 1–2 business days. For urgent product
              issues, include your account email and a description of the
              problem in your message.
            </p>
          </div>
        </div>
      </div>
    </ContentPageLayout>
  );
}
