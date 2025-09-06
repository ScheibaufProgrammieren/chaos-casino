'use client';

import Link from 'next/link';
import { useAccount } from 'wagmi';
import { useMounted } from '@/lib/useMounted';

// Reusable Game Card Component
const GameCard = ({
  href,
  title,
  description,
  tag,
  bgClass,
  auraClass,
}: {
  href: string;
  title: string;
  description: string;
  tag: string;
  bgClass: string;
  auraClass: string;
}) => (
  <div className="relative group"> {/* Added group here for the aura hover effect */}
    <Link
      href={href}
      className="relative z-10 flex h-full flex-col justify-between overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 to-white/5 p-6 ring-1 ring-white/10 transition-transform duration-300 group-hover:-translate-y-1"
    >
      <div>
        <h3 className="text-2xl font-bold tracking-tight">{title}</h3>
        <p className="mt-2 text-sm opacity-70">{description}</p>
      </div>
      <div className="relative mt-6 h-40 w-full overflow-hidden rounded-xl ring-1 ring-white/10">
        <div className={`absolute inset-0 transition-transform duration-500 group-hover:scale-110 ${bgClass}`} />
      </div>
      <div className="absolute right-4 top-4 rounded-full bg-black/30 px-3 py-1 text-[10px] uppercase tracking-wider text-white/80 backdrop-blur-sm">
        {tag}
      </div>
    </Link>
    <div className={`absolute inset-0 -z-10 rounded-3xl opacity-0 transition-opacity duration-500 group-hover:opacity-100 ${auraClass}`} />
  </div>
);

export default function HomePage() {
  const { isConnected } = useAccount();
  const isMounted = useMounted();

  return (
    // --- THIS IS THE FIX: A SINGLE, SCROLLABLE MAIN ELEMENT ---
    // The background effects are now inside, and this whole container scrolls naturally.
    <main className="relative mx-auto max-w-7xl px-6 py-12 md:py-20 text-white">
      <div className="pointer-events-none absolute inset-0 -z-20">
        <div className="absolute -inset-[20%] animate-[spin_40s_linear_infinite] rounded-[9999px] bg-[conic-gradient(at_50%_50%,#4f4e5_0deg,#22c55e_120deg,#ec4899_240deg,#4f46e5_360deg)] opacity-30 blur-[100px]" />
        <div className="absolute left-[10%] top-[15%] h-56 w-56 animate-pulse rounded-full bg-fuchsia-500/20 blur-2xl" />
        <div className="absolute right-[8%] top-[25%] h-64 w-64 animate-[pulse_3s_ease-in-out_infinite] rounded-full bg-emerald-400/20 blur-2xl" />
        <div className="absolute bottom-[8%] left-[25%] h-72 w-72 animate-[pulse_5s_ease-in-out_infinite] rounded-full bg-indigo-500/20 blur-2xl" />
      </div>

      <section className="animate-[fade-in-up_1s_ease-out] text-center">
        <h1 className="text-5xl font-extrabold leading-tight tracking-tighter md:text-7xl">
          <span className="relative inline-block">
            CHAOS CASINO
            <span className="pointer-events-none absolute inset-0 -z-10 blur-[12px] [text-shadow:0_0_50px_rgba(255,255,255,0.4)]" aria-hidden>
              CHAOS CASINO
            </span>
          </span>
          <span className="mt-2 block text-2xl font-medium text-white/70 md:text-4xl">
            Insanity. On-chain.
          </span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base opacity-80 md:text-lg">
          Four games. One balance. Countless ways to win. Buy coins once and dive into a universe of pure, unadulterated chaos.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Link 
            href="/buy" 
            className={`group inline-flex items-center gap-2 rounded-xl px-6 py-3.5 text-base font-bold transition-all duration-300 hover:scale-105 active:scale-100 ${
              isMounted && isConnected
                ? 'bg-indigo-500 text-white shadow-[0_10px_40px_rgba(129,140,248,0.25)]'
                : 'bg-white text-black shadow-[0_10px_40px_rgba(255,255,255,0.15)]'
            }`}
          >
            {isMounted && isConnected ? "Let's Go 🚀" : 'Buy Chaos Coins'}
          </Link>
          <a href="#games" className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-6 py-3.5 text-base font-bold backdrop-blur transition hover:scale-105 hover:bg-white/20 active:scale-100">
            Explore Games
          </a>
        </div>
      </section>

      <section id="games" className="mt-20 scroll-mt-20">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:gap-8">
          <GameCard
            href="/play/coinflip"
            title="Classic Coin Flip"
            description="The original fifty-fifty. Pure luck, instant results. Your journey into chaos begins here."
            tag="1 Coin"
            bgClass="bg-[url('/coinflip-bg.png')] bg-cover bg-center"
            auraClass="bg-gray-500/20 blur-2xl"
          />
          
          <GameCard
            href="/play/rift"
            title="Quantum Rift"
            description="Peer into the chaos. Predict the outcome and multiply your bet. Will you hit a legendary Paradox Bloom?"
            tag="Variable Bet"
            bgClass="bg-[url('/rift-bg.png')] bg-cover bg-center"
            auraClass="bg-purple-500/20 blur-2xl"
          />

            <GameCard
              href="/play/anvil"
              title="Aetheric Anvil"
              description="Strike the anvil and forge the impossible. Fizzle into dust or mint a rare, on-chain Chaos Rune NFT that is yours to keep."
              tag="NFT Reward"
              bgClass="bg-[url('/anvil-bg.png')] bg-cover bg-center"
              auraClass="bg-orange-500/20 blur-2xl"
            />

            <GameCard
              href="/play/altar"
              title="Chaos Altar"
              description="Dominate the 24-hour ritual. Channel coins to become the Harbinger and claim the massive jackpot, or trigger a chaotic event and win it all instantly."
              tag="Competitive Jackpot"
              bgClass="bg-[url('/altar-bg.png')] bg-cover bg-center"
              auraClass="bg-rose-500/20 blur-2xl"
            />
        </div>
      </section>

      <footer className="mt-24 text-center text-xs opacity-60">
        © {new Date().getFullYear()} Chaos Casino · Insanity on Base Sepolia
      </footer>
    </main>
  );
}
