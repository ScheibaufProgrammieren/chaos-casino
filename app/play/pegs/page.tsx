'use client';

import { useState, useEffect } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { toast } from 'sonner';
import { decodeEventLog, formatUnits } from 'viem';
import { chaosCoinAbi, chaosPegsAbi } from '@/lib/abi';

const HUB_ADDRESS = process.env.NEXT_PUBLIC_HUB_ADDRESS as `0x${string}`;
const PEGS_ADDRESS = process.env.NEXT_PUBLIC_PEGS_ADDRESS as `0x${string}`;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

const RISK_LEVELS = [
    { name: 'Low', multipliers: [16, 11, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 11, 16] },
    { name: 'Medium', multipliers: [30, 15, 7, 4, 2, 1, 0.5, 0.4, 0.3, 0.4, 0.5, 1, 2, 4, 7, 15, 30] },
    { name: 'Chaos', multipliers: [100, 30, 5, 1, 0.5, 0.3, 0.2, 0, 0, 0, 0.2, 0.3, 0.5, 1, 5, 30, 100] },
];

const PegsBoard = ({ riskLevel, outcomeBin }: { riskLevel: number, outcomeBin: number | null }) => {
    const rows = 16;
    const multipliers = RISK_LEVELS[riskLevel].multipliers;
    const [ballPath, setBallPath] = useState<{ x: number, y: number }[]>([]);

    useEffect(() => {
        if (outcomeBin === null) {
            setBallPath([]);
            return;
        }

        let path = [{ x: 50, y: -5 }]; // Start above the top peg
        let currentPeg = 0;

        for (let i = 0; i < rows; i++) {
            const pegsInRow = i + 2;
            const rowY = 5 + i * 10;
            const startX = 50 - (i + 1) * 5;

            // Determine if we need to go left or right to eventually reach the target
            const remainingRows = rows - i;
            const minPossibleEnd = currentPeg;
            const maxPossibleEnd = currentPeg + remainingRows;
            
            let direction = Math.random() < 0.5 ? -1 : 1; // -1 for left, 1 for right
            
            // Force direction if needed to stay on a valid path to the outcome
            if (maxPossibleEnd < outcomeBin) {
                direction = 1; // Must go right
            } else if (minPossibleEnd > outcomeBin) {
                direction = -1; // Must go left
            }

            if (direction === 1) {
                currentPeg++;
            }
            
            const nextX = startX + currentPeg * 10;
            path.push({ x: nextX, y: rowY });
        }
        
        // Final landing position
        const finalX = 100 / (multipliers.length + 1) * (outcomeBin + 1);
        path.push({ x: finalX, y: 105 });

        setBallPath(path);
    }, [outcomeBin]);
    
    return (
        <div className="relative w-full aspect-[4/3] bg-gray-900/50 border border-white/10 rounded-2xl overflow-hidden">
            {/* The Pegs */}
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="absolute flex w-full justify-center" style={{ top: `${5 + i * 10}%`, transform: 'translateX(-50%)', left: '50%' }}>
                    <div className="flex" style={{ gap: 'calc(10% - 8px)' }}>
                        {Array.from({ length: i + 2 }).map((_, j) => (
                            <div key={j} className="h-2 w-2 bg-white/30 rounded-full" />
                        ))}
                    </div>
                </div>
            ))}

            {/* The Ball */}
            {ballPath.length > 0 && (
                <div className="absolute h-4 w-4 bg-emerald-400 rounded-full shadow-[0_0_10px_rgba(52,211,153,0.8)] transition-all duration-300 ease-in-out" 
                     style={{ 
                         left: `${ballPath[ballPath.length - 1].x}%`, 
                         top: `${ballPath[ballPath.length - 1].y}%`, 
                         transition: `all ${0.2 * ballPath.length}s cubic-bezier(0.5, 0.1, 0.9, 0.5)`
                     }}
                />
            )}

            {/* The Bins */}
            <div className="absolute bottom-0 left-0 w-full h-[8%] flex justify-center">
                {multipliers.map((m, i) => {
                    const isDead = m === 0;
                    return (
                        <div key={i} className={`text-xs text-center font-bold h-full flex-1 flex items-center justify-center rounded-t-md mx-px transition-all duration-300
                            ${outcomeBin === i ? (isDead ? 'bg-rose-600' : 'bg-emerald-500') : (isDead ? 'bg-rose-900/50' : 'bg-gray-800/50')}
                        `}>
                            {m}x
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default function PegsPage() {
    const { address } = useAccount();
    const [betAmount, setBetAmount] = useState<string>('1');
    const [riskLevel, setRiskLevel] = useState<number>(1);
    const [outcomeBin, setOutcomeBin] = useState<number | null>(null);

    const { data: coins, refetch: refetchCoins } = useReadContract({ address: HUB_ADDRESS, abi: chaosCoinAbi, functionName: 'getCoins', args: [address ?? ZERO_ADDRESS], query: { enabled: !!address } });
    const { writeContractAsync, data: hash, reset } = useWriteContract();
    const { isLoading, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash });

    const betAmountAsBigInt = BigInt(Number(betAmount) || 0);
    const hasEnoughCoins = coins ? coins >= betAmountAsBigInt : false;

    async function handleDrop() {
        if (!hasEnoughCoins) { toast.error('Not enough coins for this bet.'); return; }
        setOutcomeBin(null); // Reset the animation
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
                const { pointsWon, outcomeBin: bin } = dropEvent.args;
                setOutcomeBin(bin); // Trigger the animation with the correct outcome
                setTimeout(() => {
                    if (pointsWon === BigInt(0)) {
                        toast.error('💥 UNLUCKY! You hit a dead bin.');
                    } else {
                        toast.success(`WIN! You won ${formatUnits(pointsWon, 0)} points!`);
                    }
                }, 2000); // Show toast after animation
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
                    <PegsBoard riskLevel={riskLevel} outcomeBin={outcomeBin} />
                </div>
            </div>
        </main>
    );
}
