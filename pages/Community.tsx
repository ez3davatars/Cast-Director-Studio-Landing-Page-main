import { MessageCircle, Youtube, Users, Mail } from 'lucide-react';
import ContentPageLayout from '../components/ContentPageLayout';

const channels = [
  {
    icon: Users,
    title: 'Join the Creator Community',
    description:
      'Connect with other AI content creators, filmmakers, and visual storytellers using Cast Director Studio. Share techniques, get feedback, and discover new workflows.',
    linkLabel: 'Coming Soon',
    href: '#',
    disabled: true,
  },
  {
    icon: MessageCircle,
    title: 'Discord Community',
    description:
      'Our Discord server is the primary hub for real-time discussion, workflow sharing, feature requests, and direct creator-to-creator support.',
    linkLabel: 'Join Discord',
    href: 'https://discord.gg/5QucHe3Xd9',
    disabled: false,
  },
  {
    icon: Youtube,
    title: 'YouTube Channel',
    description:
      'Watch tutorials, workflow breakdowns, creator showcases, and product updates on our YouTube channel.',
    linkLabel: 'Coming Soon',
    href: '#',
    disabled: true,
  },
  {
    icon: Mail,
    title: 'Get Launch Updates',
    description:
      'Stay informed about new features, tutorials, community events, and product updates. Updates are sent through our existing email communications.',
    linkLabel: 'Contact Us',
    href: '/contact',
    disabled: false,
  },
];

export default function Community() {
  return (
    <ContentPageLayout title="Community">
      <div className="mb-16">
        <div className="w-10 h-[3px] rounded-full bg-nano-yellow mb-4" />
        <h1 className="font-display text-4xl md:text-5xl font-bold text-white tracking-tight mb-6">
          Community
        </h1>
        <p className="text-lg text-slate-300 leading-relaxed max-w-3xl">
          Cast Director Studio is built for creators. Our community channels are
          being set up to give you places to share results, learn new workflows,
          and connect with other creators using directed AI character tools.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-16">
        {channels.map((ch) => {
          const Icon = ch.icon;
          return (
            <div
              key={ch.title}
              className="p-6 rounded-2xl border border-white/[0.04] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.08] transition-all duration-300 flex flex-col"
            >
              <div className="w-10 h-10 rounded-xl bg-white/[0.04] flex items-center justify-center mb-4">
                <Icon size={20} className="text-nano-yellow" />
              </div>
              <h3 className="font-display text-lg font-bold text-white mb-3">
                {ch.title}
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed mb-6 flex-1">
                {ch.description}
              </p>
              {ch.disabled ? (
                <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                  {ch.linkLabel}
                </span>
              ) : (
                <a
                  href={ch.href}
                  {...(ch.href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  className="text-xs font-semibold uppercase tracking-widest text-nano-yellow hover:text-white transition-colors"
                >
                  {ch.linkLabel} →
                </a>
              )}
            </div>
          );
        })}
      </div>

      {/* Support callout */}
      <div className="p-8 rounded-2xl border border-white/[0.06] bg-white/[0.02] text-center">
        <h2 className="font-display text-xl font-bold text-white mb-3">
          Need Help Now?
        </h2>
        <p className="text-slate-400 mb-6 max-w-lg mx-auto">
          If you have a question about your account, a generation issue, or need
          workflow support, our team is available via email.
        </p>
        <a
          href="/contact"
          className="inline-block px-6 py-3 rounded-full bg-white/10 text-white text-sm font-bold uppercase tracking-wide hover:bg-[#d4a017] hover:text-black transition-all"
        >
          Contact Support
        </a>
      </div>
    </ContentPageLayout>
  );
}
