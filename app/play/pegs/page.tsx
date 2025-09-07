'use client';

import { useState, useEffect } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { toast } from 'sonner';
import { decodeEventLog, formatUnits } from 'viem';
import { chaosCoinAbi, chaosPegsAbi } from '@/lib/abi'; // You'll create chaosPegsAbi

const HUB_ADDRESS = process.env.NEXT_PUBLIC_HUB_ADDRESS as `0x${string}`;
const PEGS_ADDRESS = process.env.NEXT_PUBLIC_PEGS_ADDRESS as `0x${string}`; // Add this to Vercel
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

const RISK_LEVELS = [
    { name: 'Low', multipliers: [16, 11, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 11, 16] },
    { name: 'Medium', multipliers: [30, 15, 7, 4, 2, 1, 0.5, 0.4, 0.3, 0.4, 0.5, 1, 2, 4, 7, 15, 30] },
    { name: 'Chaos', multipliers: [100, 30, 5, 1, 0.5, 0.3, 0.2, 0, 0, 0, 0.2, 0.3, 0.5, 1, 5, 30, 100] },
];

// --- THE SICK NEW VISUAL COMPONENT ---
const PegsBoard = ({ riskLevel, onAnimationComplete }: { riskLevel: number, onAnimationComplete: (bin: number) => void }) => {
    const rows = 16;
    const multipliers = RISK_LEVELS[riskLevel].multipliers;

    // This is just a placeholder for the animation. A real implementation would use a physics library.
    useEffect(() => {
        // In a real app, you would trigger the animation here and call onAnimationComplete when it's done.
    }, []);

    return (
        <div className="relative flex flex-col items-center p-4">
            {/* Generating the pegs pyramid */}
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="flex" style={{ marginLeft: `${-20 * (i + 1)}px` }}>
                    {Array.from({ length: i + 2 }).map((_, j) => (
                        <div key={j} className="h-2 w-2 bg-white/30 rounded-full m-[18px]" />
                    ))}
                </div>
            ))}
            {/* The prize bins at the bottom */}
            <div className="flex mt-4">
                {multipliers.map((m, i) => (
                    <div key={i} className="text-xs text-center font-bold h-8 w-10 flex items-center justify-center rounded bg-gray-800/50 mx-0.5">
                        {m}x
                    </div>
                ))}
            </div>
            <p className="text-white/30 text-xs mt-4">Animation will be implemented here</p>
        </div>
    );
};

export default function PegsPage() {
    const { address } = useAccount();
    const [betAmount, setBetAmount] = useState<string>('1');
    const [riskLevel, setRiskLevel] = useState<number>(1); // Default to Medium

    const { data: coins, refetch: refetchCoins } = useReadContract({ address: HUB_ADDRESS, abi: chaosCoinAbi, functionName: 'getCoins', args: [address ?? ZERO_ADDRESS], query: { enabled: !!address } });
    const { writeContractAsync, data: hash, reset } = useWriteContract();
    const { isLoading, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash });

    const betAmountAsBigInt = BigInt(Number(betAmount) || 0);
    const hasEnoughCoins = coins ? coins >= betAmountAsBigInt : false;

    async function handleDrop() {
        if (!hasEnoughCoins) { toast.error('Not enough coins for this bet.'); return; }
        try {
            await writeContractAsync({
                address: PEGS_ADDRESS,
                abi: chaosPegsAbi,
                functionName: 'dropBall',
                args: [betAmountAsBigInt, riskLevel],
            });
            toast.info('Dropping ball...');
        } catch (e) {
            console.error(e);
            toast.error('Transaction rejected.');
        }
    }

    useEffect(() => {
        if (isSuccess && receipt) {
            let dropEvent;
            for (const log of receipt.logs) {
                try { const event = decodeEventLog({ abi: chaosPegsAbi, ...log }); if (event.eventName === 'BallDropped') { dropEvent = event; break; } } catch {}
            }
            if (dropEvent) {
                const { pointsWon } = dropEvent.args;
                if (pointsWon === BigInt(0)) {
                    toast.error('💥 UNLUCKY! You hit a dead bin.');
                } else {
                    toast.success(`WIN! You won ${formatUnits(pointsWon, 0)} points!`);
                }
                // Here you would trigger the animation with the outcome bin
            }
            refetchCoins();
            reset();
        }
    }, [isSuccess, receipt, refetchCoins, reset]);

    return (
        <main className="mx-auto max-w-7xl px-6 py-12">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                {/* Left Side - Controls */}
                <div className="lg:col-span-1 space-y-6 rounded-2xl border border-white/10 bg-white/[0.02] p-6 sticky top-24">
                    <div>
                        <h2 className="text-2xl font-bold">Chaos Pegs</h2>
                        <p className="text-white/60 mt-1">Pure on-chain Plinko. Every drop is a new fate.</p>
                    </div>
                    <div>
                        <label className="text-sm font-medium text-white/80">Bet Amount (Coins)</label>
                        <input type="number" value={betAmount} onChange={(e) => setBetAmount(e.target.value)} className="w-full mt-2 rounded-xl border-white/10 bg-white/5 p-4 text-xl font-semibold outline-none ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-white" min="1" disabled={isLoading}/>
                    </div>
                    <div>
                        <label className="text-sm font-medium text-white/80">Risk Level</label>
                        <div className="grid grid-cols-3 gap-2 mt-2">
                            <button onClick={() => setRiskLevel(0)} className={`choice ${riskLevel === 0 ? 'active' : ''}`} disabled={isLoading}>Low</button>
                            <button onClick={() => setRiskLevel(1)} className={`choice ${riskLevel === 1 ? 'active' : ''}`} disabled={isLoading}>Medium</button>
                            <button onClick={() => setRiskLevel(2)} className={`choice ${riskLevel === 2 ? 'active' : ''}`} disabled={isLoading}>Chaos</button>
                        </div>
                    </div>
                    <button onClick={handleDrop} disabled={isLoading || !hasEnoughCoins} className="btn-cta glow">
                        {isLoading ? 'Dropping...' : 'Drop Ball'}
                    </button>
                </div>

                {/* Right Side - Board */}
                <div className="lg:col-span-2">
                    <PegsBoard riskLevel={riskLevel} onAnimationComplete={() => {}} />
                </div>
            </div>
        </main>
    );
}