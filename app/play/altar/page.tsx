// app/play/altar/page.tsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAccount } from 'wagmi';
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { toast } from 'sonner';
import { formatUnits, decodeEventLog, type Abi } from 'viem';

import { chaosCoinAbi, chaosAltarAbi } from '@/lib/abi';

const HUB_ADDRESS = process.env.NEXT_PUBLIC_HUB_ADDRESS as `0x${string}`;
const ALTAR_ADDRESS = process.env.NEXT_PUBLIC_ALTAR_ADDRESS as `0x${string}`;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

const formatTime = (seconds: number) => {
  if (seconds < 0) seconds = 0;
  const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
};

export default function AltarPage() {
  const { address } = useAccount();
  
  const [channelAmount, setChannelAmount] = useState<string>('10');
  const [timeLeft, setTimeLeft] = useState<number>(0);

  const { data: coins, refetch: refetchCoins } = useReadContract({ address: HUB_ADDRESS, abi: chaosCoinAbi, functionName: 'getCoins', args: [address ?? ZERO_ADDRESS], query: { enabled: !!address, refetchInterval: 5000 }, });
  const { data: altarTime, refetch: refetchAltarData } = useReadContract({ address: ALTAR_ADDRESS, abi: chaosAltarAbi, functionName: 'getTimeLeft', query: { refetchInterval: 30000 }, });
  const { data: jackpot, refetch: refetchJackpot } = useReadContract({ address: ALTAR_ADDRESS, abi: chaosAltarAbi, functionName: 'altarEssence', query: { refetchInterval: 5000 } });
  const { data: harbinger, refetch: refetchHarbinger } = useReadContract({ address: ALTAR_ADDRESS, abi: chaosAltarAbi, functionName: 'currentHarbinger', query: { refetchInterval: 5000 } });
  
  const { writeContractAsync, data: hash, reset: resetWriteContract } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed, data: receipt } = useWaitForTransactionReceipt({ hash });

  const channelAmountAsBigInt = BigInt(Number(channelAmount) || 0);
  const hasEnoughCoins = coins ? coins >= channelAmountAsBigInt : false;
  const isHarbinger = useMemo(() => address && harbinger && address.toLowerCase() === harbinger.toLowerCase(), [address, harbinger]);

  useEffect(() => {
    if (altarTime) { setTimeLeft(Number(altarTime)); }
    const timer = setInterval(() => { setTimeLeft((prevTime) => (prevTime > 0 ? prevTime - 1 : 0)); }, 1000);
    return () => clearInterval(timer);
  }, [altarTime]);
  
  async function handleChannel() {
    if (!hasEnoughCoins) { toast.error('Not enough coins to channel.'); return; }
    if (channelAmountAsBigInt < 5) { toast.error('You must channel at least 5 coins.'); return; }
    const toastId = toast.loading('Channeling energy to the Altar...');
    try {
      await writeContractAsync({ address: ALTAR_ADDRESS, abi: chaosAltarAbi, functionName: 'channel', args: [channelAmountAsBigInt] });
      toast.loading('Waiting for the chaotic event...', { id: toastId });
    } catch { toast.error('Transaction rejected.', { id: toastId }); }
  }
  
  useEffect(() => {
    if (isConfirmed && receipt) {
      toast.dismiss();
      toast.success('Channeling Confirmed!');
      
      // --- POLISH: Parse the event to give the user specific feedback ---
      let chaoticEvent;
      for (const log of receipt.logs) {
        try { const event = decodeEventLog({ abi: chaosAltarAbi, ...log }); if (event.eventName === 'ChaoticEvent') { chaoticEvent = event; break; } } catch {}
      }

      if (chaoticEvent) {
          const { eventType, pointsWon } = chaoticEvent.args;
          if (eventType === 'Altar Shatter') {
              toast.success(`💥 JACKPOT! You shattered the Altar and won ${pointsWon.toString()} points!`);
          } else if (eventType === 'Essence Drain') {
              toast.info(`💧 Essence Drain! You siphoned ${pointsWon.toString()} points from the jackpot.`);
          } else if (eventType === 'Power Surge') {
              toast.info(`⚡️ Power Surge! Your channeled amount was doubled for dominance.`);
          }
      }

      refetchCoins(); refetchAltarData(); refetchJackpot(); refetchHarbinger();
      resetWriteContract();
    }
  }, [isConfirmed, receipt, refetchCoins, refetchAltarData, refetchJackpot, refetchHarbinger, resetWriteContract]);


  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <div className="text-center">
        <h1 className="text-4xl font-extrabold tracking-tight">Chaos Altar</h1>
        <p className="mt-2 text-white/60">Become the Harbinger. Dominate the ritual. The entire jackpot could be yours.</p>
      </div>

      <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className={`flex flex-col items-center justify-center rounded-3xl border  p-8 text-center transition-all duration-500 ${isHarbinger ? 'border-purple-500/50' : 'border-amber-400/20'}`}>
          <p className={`text-sm font-semibold uppercase tracking-widest ${isHarbinger ? 'text-purple-400' : 'text-amber-400/80'}`}>Current Jackpot</p>
          {/* --- POLISH: Added subtle pulse animation to jackpot --- */}
          <p className={`mt-2 text-6xl font-extrabold animate-pulse ${isHarbinger ? 'text-purple-300' : 'text-amber-300'}`}>
            {jackpot ? formatUnits(jackpot, 0) : '0'}
          </p>
          <p className="text-xl text-white/70">Points</p>
        </div>
        <div className="flex flex-col items-center justify-center rounded-3xl border border-white/10 bg-black/20 p-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-white/60">Time Left in Round</p>
          <p className="mt-2 text-6xl font-extrabold">{formatTime(timeLeft)}</p>
          <p className="text-xl text-white/70">Hours : Mins : Secs</p>
        </div>
      </div>
      
      <div className="mt-6 rounded-3xl border border-white/10 bg-gradient-to-br from-white/5 to-white/[0.02] p-8">
        <div className="grid grid-cols-1 md:grid-cols-[1fr,2fr] gap-8 items-center">
           <div className="text-center md:text-left">
              <h2 className="text-lg font-semibold">Current Harbinger</h2>
              {/* --- POLISH: Visual indicator if YOU are the Harbinger --- */}
              {isHarbinger && <p className="text-sm font-bold text-purple-400">👑 YOU ARE THE HARBINGER 👑</p>}
              {harbinger && harbinger !== ZERO_ADDRESS && !isHarbinger && (
                <p className="truncate text-sm text-purple-400" title={harbinger}>{`${harbinger.slice(0, 6)}...${harbinger.slice(-4)}`}</p>
              )}
              {!harbinger || harbinger === ZERO_ADDRESS && <p className="text-sm text-white/60">None - The throne is empty.</p>}
           </div>
            <div>
              <h2 className="text-lg font-semibold text-white/80">Channel Coins to Gain Dominance</h2>
              <div className="mt-2 flex gap-2">
                <input type="number" value={channelAmount} onChange={(e) => setChannelAmount(e.target.value)} className="flex-grow rounded-xl border-white/10 bg-white/5 p-4 text-xl font-semibold outline-none ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-white" placeholder="Min 5" min="5"/>
                <button onClick={handleChannel} disabled={isConfirming || !hasEnoughCoins || channelAmountAsBigInt < 5} className="w-48 rounded-xl bg-purple-600 px-6 py-4 text-lg font-bold text-white shadow-lg transition hover:scale-105 hover:bg-purple-500 active:scale-100 disabled:cursor-not-allowed disabled:bg-gray-600 disabled:opacity-50">
                  {isConfirming ? '...' : 'Channel'}
                </button>
              </div>
            </div>
        </div>
      </div>
      
      {/* --- POLISH: Added a (placeholder) recent events log --- */}
       <div className="mt-8">
        <h2 className="text-xl font-bold text-center">Recent Altar Events</h2>
        <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-4 text-center">
          <p className="text-white/60">A log of recent chaotic events will appear here.</p>
          <p className="text-xs text-white/40">(Coming soon)</p>
        </div>
      </div>
    </main>
  );
}